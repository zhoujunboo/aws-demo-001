package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientCallsAgentContract(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer shared-key" {
			t.Fatalf("unexpected authorization header: %q", request.Header.Get("Authorization"))
		}
		var payload struct {
			Input     CreateTaskInput `json:"input"`
			RequestID string          `json:"requestId"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if payload.RequestID != "execution-1" || payload.Input.Description != "Generate a frontend resume" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"succeeded","output":{"text":"Generated resume"}}`))
	}))
	defer server.Close()

	client := NewClient("shared-key", 5*time.Second)
	client.httpClient = server.Client()
	output, err := client.Run(context.Background(), Agent{EndpointURL: server.URL}, "execution-1", CreateTaskInput{
		Description: "Generate a frontend resume",
	})
	if err != nil {
		t.Fatalf("Run returned an error: %v", err)
	}
	if output != "Generated resume" {
		t.Fatalf("unexpected output: %q", output)
	}
}

func TestClientPreservesAgentErrorCode(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusGatewayTimeout)
		_, _ = writer.Write([]byte(`{"status":"failed","error":{"code":"agent_timeout"}}`))
	}))
	defer server.Close()

	client := NewClient("shared-key", 5*time.Second)
	client.httpClient = server.Client()
	_, err := client.Run(context.Background(), Agent{EndpointURL: server.URL}, "execution-1", CreateTaskInput{
		Description: "Generate a frontend resume",
	})
	runError, ok := err.(*RunError)
	if !ok || runError.Code != "agent_timeout" {
		t.Fatalf("expected agent_timeout, got %v", err)
	}
}
