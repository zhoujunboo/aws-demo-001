package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSchedulerClientParsesJSONPlan(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected scheduler path: %q", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer scheduler-key" {
			t.Fatalf("unexpected authorization header: %q", request.Header.Get("Authorization"))
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"choices":[{"message":{"content":"{\"steps\":[{\"title\":\"分析需求\",\"instruction\":\"分析需求并输出结构化执行提纲\"}]}"}}]
		}`))
	}))
	defer server.Close()

	client, err := NewSchedulerClient(server.URL, "scheduler-key", "test-model", 5*time.Second)
	if err != nil {
		t.Fatalf("NewSchedulerClient returned an error: %v", err)
	}
	client.httpClient = server.Client()
	steps, err := client.Decompose(context.Background(), "Generate a frontend engineer resume")
	if err != nil {
		t.Fatalf("Decompose returned an error: %v", err)
	}
	if len(steps) != 1 || steps[0].Title != "分析需求" {
		t.Fatalf("unexpected scheduler plan: %#v", steps)
	}
}

func TestSchedulerClientNormalizesOpenAICompatibleURLs(t *testing.T) {
	testCases := []struct {
		basePath     string
		expectedPath string
		name         string
	}{
		{name: "root URL", basePath: "", expectedPath: "/v1/chat/completions"},
		{name: "versioned URL", basePath: "/v1", expectedPath: "/v1/chat/completions"},
		{name: "complete endpoint", basePath: "/v1/chat/completions", expectedPath: "/v1/chat/completions"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if request.URL.Path != testCase.expectedPath {
					t.Fatalf("unexpected scheduler path: %q", request.URL.Path)
				}
				writer.Header().Set("Content-Type", "application/json")
				_, _ = writer.Write([]byte(`{
					"choices":[{"message":{"content":"{\"steps\":[{\"title\":\"分析需求\",\"instruction\":\"分析需求并输出结构化执行提纲\"}]}"}}]
				}`))
			}))
			defer server.Close()

			client, err := NewSchedulerClient(
				server.URL+testCase.basePath,
				"scheduler-key",
				"test-model",
				5*time.Second,
			)
			if err != nil {
				t.Fatalf("NewSchedulerClient returned an error: %v", err)
			}
			client.httpClient = server.Client()
			if _, err := client.Decompose(context.Background(), "Generate a resume"); err != nil {
				t.Fatalf("Decompose returned an error: %v", err)
			}
		})
	}
}

func TestSchedulerClientRejectsInvalidPlan(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"choices":[{"message":{"content":"{\"steps\":[]}"}}]}`))
	}))
	defer server.Close()

	client, err := NewSchedulerClient(server.URL, "scheduler-key", "test-model", 5*time.Second)
	if err != nil {
		t.Fatalf("NewSchedulerClient returned an error: %v", err)
	}
	client.httpClient = server.Client()
	if _, err := client.Decompose(context.Background(), "Generate a frontend engineer resume"); err == nil {
		t.Fatal("expected invalid plan error")
	}
}
