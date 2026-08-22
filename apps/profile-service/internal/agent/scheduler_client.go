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
	"strings"
	"time"
)

const maxSchedulerResponseBytes = 200_000

type SchedulerClient struct {
	apiKey     string
	endpoint   string
	httpClient *http.Client
	model      string
}

func NewSchedulerClient(
	baseURL string,
	apiKey string,
	model string,
	timeout time.Duration,
) (*SchedulerClient, error) {
	trimmedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	parsedURL, err := url.Parse(trimmedBaseURL)
	if err != nil || parsedURL.Scheme != "https" || parsedURL.Host == "" {
		return nil, errors.New("SCHEDULER_AI_BASE_URL must be a valid HTTPS URL")
	}
	if parsedURL.RawQuery != "" || parsedURL.Fragment != "" {
		return nil, errors.New("SCHEDULER_AI_BASE_URL must not contain a query or fragment")
	}
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(model) == "" {
		return nil, errors.New("scheduler API key and model are required")
	}
	trimmedPath := strings.TrimRight(parsedURL.Path, "/")
	switch {
	case strings.HasSuffix(trimmedPath, "/chat/completions"):
		parsedURL.Path = trimmedPath
	case strings.HasSuffix(trimmedPath, "/v1"):
		parsedURL.Path = trimmedPath + "/chat/completions"
	default:
		parsedURL.Path = trimmedPath + "/v1/chat/completions"
	}
	parsedURL.RawPath = ""
	return &SchedulerClient{
		apiKey: strings.TrimSpace(apiKey), endpoint: parsedURL.String(),
		httpClient: &http.Client{Timeout: timeout}, model: strings.TrimSpace(model),
	}, nil
}

func (client *SchedulerClient) Decompose(
	ctx context.Context,
	description string,
) ([]WorkflowSubtask, error) {
	payload := map[string]any{
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "你是 Agent 平台调度器。把用户需求拆成 1 到 3 个有先后顺序、可独立交给 Agent 的文本任务。只返回 JSON：{\"steps\":[{\"title\":\"简短标题\",\"instruction\":\"完整执行指令\"}]}。不要 Markdown。",
			},
			{"role": "user", "content": description},
		},
		"model":       client.model,
		"temperature": 0.1,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode scheduler request: %w", err)
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		client.endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("create scheduler request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("call scheduler AI: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxSchedulerResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read scheduler response: %w", err)
	}
	if len(responseBody) > maxSchedulerResponseBytes {
		return nil, errors.New("scheduler response is too large")
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("scheduler AI returned HTTP %d", response.StatusCode)
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil || len(result.Choices) == 0 {
		return nil, errors.New("scheduler AI returned an invalid response")
	}
	content := strings.TrimSpace(result.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	var plan struct {
		Steps []WorkflowSubtask `json:"steps"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &plan); err != nil {
		return nil, fmt.Errorf("decode scheduler plan: %w", err)
	}
	if len(plan.Steps) == 0 || len(plan.Steps) > maxWorkflowSteps {
		return nil, errors.New("scheduler plan must contain 1 to 3 steps")
	}
	for index := range plan.Steps {
		plan.Steps[index].Title = strings.TrimSpace(plan.Steps[index].Title)
		plan.Steps[index].Instruction = strings.TrimSpace(plan.Steps[index].Instruction)
		if plan.Steps[index].Title == "" || len(plan.Steps[index].Title) > 80 ||
			len(plan.Steps[index].Instruction) < 10 || len(plan.Steps[index].Instruction) > 2_000 {
			return nil, errors.New("scheduler plan contains an invalid step")
		}
	}
	return plan.Steps, nil
}
