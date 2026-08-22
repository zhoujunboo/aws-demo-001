package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const maxMatchingResponseBytes = 2_000_000

const dashscopeRerankPath = "/api/v1/services/rerank/text-rerank/text-rerank"

type rerankResult struct {
	Index          int      `json:"index"`
	RelevanceScore *float64 `json:"relevance_score"`
	Score          *float64 `json:"score"`
}

type EmbeddingProvider interface {
	Embed(context.Context, []string) ([][]float64, error)
	EmbeddingModel() string
}

type RerankProvider interface {
	Rerank(context.Context, string, []string) ([]float64, error)
}

type MatchingClient struct {
	apiKey         string
	baseURL        string
	dashscopeURL   string
	embeddingModel string
	httpClient     *http.Client
	rerankModel    string
}

func NewMatchingClient(
	baseURL string,
	apiKey string,
	embeddingModel string,
	rerankModel string,
	rerankURL string,
	timeout time.Duration,
) (*MatchingClient, error) {
	trimmedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	parsedURL, err := url.Parse(trimmedBaseURL)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return nil, errors.New("MATCHING_AI_BASE_URL must be a valid URL")
	}
	isLocalHTTP := parsedURL.Scheme == "http" &&
		(parsedURL.Hostname() == "127.0.0.1" || parsedURL.Hostname() == "localhost" || parsedURL.Hostname() == "::1")
	if parsedURL.Scheme != "https" && !isLocalHTTP {
		return nil, errors.New("MATCHING_AI_BASE_URL must use HTTPS")
	}
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(embeddingModel) == "" || strings.TrimSpace(rerankModel) == "" {
		return nil, errors.New("matching API key, embedding model, and rerank model are required")
	}
	dashscopeURL := strings.TrimSpace(rerankURL)
	if dashscopeURL == "" && parsedURL.Hostname() == "dashscope.aliyuncs.com" {
		dashscopeURL = parsedURL.Scheme + "://" + parsedURL.Host + dashscopeRerankPath
	}
	if dashscopeURL != "" {
		parsedRerankURL, parseErr := url.Parse(dashscopeURL)
		if parseErr != nil || parsedRerankURL.Scheme != "https" || parsedRerankURL.Host == "" {
			return nil, errors.New("MATCHING_RERANK_URL must be a valid HTTPS URL")
		}
	}
	return &MatchingClient{
		apiKey:         strings.TrimSpace(apiKey),
		baseURL:        trimmedBaseURL,
		dashscopeURL:   dashscopeURL,
		embeddingModel: strings.TrimSpace(embeddingModel),
		httpClient:     &http.Client{Timeout: timeout},
		rerankModel:    strings.TrimSpace(rerankModel),
	}, nil
}

func (client *MatchingClient) EmbeddingModel() string {
	return client.embeddingModel
}

func (client *MatchingClient) Embed(ctx context.Context, texts []string) ([][]float64, error) {
	if len(texts) == 0 {
		return nil, errors.New("embedding input must not be empty")
	}
	var response struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
			Index     int       `json:"index"`
		} `json:"data"`
	}
	if err := client.postJSON(ctx, "/embeddings", struct {
		Input []string `json:"input"`
		Model string   `json:"model"`
	}{Input: texts, Model: client.embeddingModel}, &response); err != nil {
		return nil, fmt.Errorf("request embeddings: %w", err)
	}
	if len(response.Data) != len(texts) {
		return nil, fmt.Errorf("embedding API returned %d vectors for %d inputs", len(response.Data), len(texts))
	}
	sort.Slice(response.Data, func(left, right int) bool {
		return response.Data[left].Index < response.Data[right].Index
	})
	embeddings := make([][]float64, len(response.Data))
	for index, item := range response.Data {
		if item.Index != index || len(item.Embedding) == 0 {
			return nil, errors.New("embedding API returned invalid vector data")
		}
		embeddings[index] = item.Embedding
	}
	return embeddings, nil
}

func (client *MatchingClient) Rerank(ctx context.Context, query string, documents []string) ([]float64, error) {
	if len(documents) == 0 {
		return nil, errors.New("rerank documents must not be empty")
	}
	if client.dashscopeURL != "" {
		return client.rerankWithDashscope(ctx, query, documents)
	}
	var response struct {
		Results []rerankResult `json:"results"`
	}
	if err := client.postJSON(ctx, "/rerank", struct {
		Documents []string `json:"documents"`
		Model     string   `json:"model"`
		Query     string   `json:"query"`
		TopN      int      `json:"top_n"`
	}{Documents: documents, Model: client.rerankModel, Query: query, TopN: len(documents)}, &response); err != nil {
		return nil, fmt.Errorf("request rerank: %w", err)
	}
	return parseRerankResults(response.Results, len(documents))
}

func (client *MatchingClient) rerankWithDashscope(
	ctx context.Context,
	query string,
	documents []string,
) ([]float64, error) {
	var response struct {
		Output struct {
			Results []rerankResult `json:"results"`
		} `json:"output"`
	}
	payload := struct {
		Input struct {
			Documents []string `json:"documents"`
			Query     string   `json:"query"`
		} `json:"input"`
		Model      string `json:"model"`
		Parameters struct {
			ReturnDocuments bool `json:"return_documents"`
			TopN            int  `json:"top_n"`
		} `json:"parameters"`
	}{Model: client.rerankModel}
	payload.Input.Documents = documents
	payload.Input.Query = query
	payload.Parameters.TopN = len(documents)
	if err := client.postJSONToURL(ctx, client.dashscopeURL, payload, &response); err != nil {
		return nil, fmt.Errorf("request DashScope rerank: %w", err)
	}
	return parseRerankResults(response.Output.Results, len(documents))
}

func parseRerankResults(results []rerankResult, documentCount int) ([]float64, error) {
	if len(results) != documentCount {
		return nil, fmt.Errorf("rerank API returned %d scores for %d documents", len(results), documentCount)
	}
	scores := make([]float64, documentCount)
	seen := make([]bool, documentCount)
	for _, item := range results {
		if item.Index < 0 || item.Index >= documentCount || seen[item.Index] {
			return nil, errors.New("rerank API returned an invalid document index")
		}
		score := item.RelevanceScore
		if score == nil {
			score = item.Score
		}
		if score == nil {
			return nil, errors.New("rerank API returned a result without a score")
		}
		scores[item.Index] = *score
		seen[item.Index] = true
	}
	return scores, nil
}

func (client *MatchingClient) postJSON(ctx context.Context, path string, payload, result any) error {
	return client.postJSONToURL(ctx, client.baseURL+path, payload, result)
}

func (client *MatchingClient) postJSONToURL(ctx context.Context, endpoint string, payload, result any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := client.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("call matching API: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxMatchingResponseBytes+1))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if len(responseBody) > maxMatchingResponseBytes {
		return errors.New("matching API response is too large")
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("matching API returned HTTP %d", response.StatusCode)
	}
	if err := json.Unmarshal(responseBody, result); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}
