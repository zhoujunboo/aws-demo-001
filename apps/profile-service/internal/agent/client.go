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

const maxAgentResponseBytes = 100_000

type Runner interface {
	Run(context.Context, Agent, string, CreateTaskInput) (string, error)
}

type Client struct {
	apiKey     string
	httpClient *http.Client
}

type RunError struct {
	Code string
	Err  error
}

func (runError *RunError) Error() string {
	return runError.Err.Error()
}

func (runError *RunError) Unwrap() error {
	return runError.Err
}

func NewClient(apiKey string, timeout time.Duration) *Client {
	return &Client{
		apiKey: strings.TrimSpace(apiKey),
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (client *Client) Run(ctx context.Context, selectedAgent Agent, requestID string, input CreateTaskInput) (string, error) {
	endpoint, err := url.Parse(selectedAgent.EndpointURL)
	if err != nil {
		return "", &RunError{Code: "invalid_agent_endpoint", Err: errors.New("agent endpoint must be a valid HTTPS URL")}
	}
	isLocalHTTP := endpoint.Scheme == "http" &&
		(endpoint.Hostname() == "127.0.0.1" || endpoint.Hostname() == "localhost" || endpoint.Hostname() == "::1")
	if (endpoint.Scheme != "https" && !isLocalHTTP) || endpoint.Host == "" {
		return "", &RunError{Code: "invalid_agent_endpoint", Err: errors.New("agent endpoint must be a valid HTTPS URL")}
	}

	payload, err := json.Marshal(struct {
		Input     CreateTaskInput `json:"input"`
		RequestID string          `json:"requestId"`
	}{
		Input:     input,
		RequestID: requestID,
	})
	if err != nil {
		return "", &RunError{Code: "encode_request_failed", Err: fmt.Errorf("encode agent request: %w", err)}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return "", &RunError{Code: "create_request_failed", Err: fmt.Errorf("create agent request: %w", err)}
	}
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := client.httpClient.Do(request)
	if err != nil {
		code := "agent_unavailable"
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			code = "agent_timeout"
		}
		return "", &RunError{Code: code, Err: fmt.Errorf("call agent: %w", err)}
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxAgentResponseBytes+1))
	if err != nil {
		return "", &RunError{Code: "read_response_failed", Err: fmt.Errorf("read agent response: %w", err)}
	}
	if len(body) > maxAgentResponseBytes {
		return "", &RunError{Code: "response_too_large", Err: errors.New("agent response is too large")}
	}

	var result struct {
		Error *struct {
			Code string `json:"code"`
		} `json:"error"`
		Output *struct {
			Text string `json:"text"`
		} `json:"output"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", &RunError{Code: "invalid_agent_response", Err: fmt.Errorf("decode agent response: %w", err)}
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices || result.Status != "succeeded" {
		code := "agent_execution_failed"
		if result.Error != nil && result.Error.Code != "" {
			code = result.Error.Code
		}
		return "", &RunError{Code: code, Err: fmt.Errorf("agent returned HTTP %d", response.StatusCode)}
	}
	if result.Output == nil || strings.TrimSpace(result.Output.Text) == "" {
		return "", &RunError{Code: "empty_agent_response", Err: errors.New("agent returned an empty response")}
	}
	return strings.TrimSpace(result.Output.Text), nil
}
