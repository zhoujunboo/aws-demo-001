package agent

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestMatchingClientEmbedsAndReranks(t *testing.T) {
	client, err := NewMatchingClient(
		"https://matching.example/v1",
		"test-key",
		"embedding-model",
		"rerank-model",
		"",
		time.Second,
	)
	if err != nil {
		t.Fatalf("NewMatchingClient returned an error: %v", err)
	}
	client.httpClient.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("unexpected authorization header: %q", request.Header.Get("Authorization"))
		}
		body := `{"data":[{"embedding":[0.1,0.2],"index":0}]}`
		if request.URL.Path == "/v1/rerank" {
			body = `{"results":[{"index":1,"relevance_score":0.9},{"index":0,"relevance_score":0.2}]}`
		}
		return &http.Response{
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
			StatusCode: http.StatusOK,
		}, nil
	})

	embeddings, err := client.Embed(context.Background(), []string{"resume task"})
	if err != nil {
		t.Fatalf("Embed returned an error: %v", err)
	}
	if len(embeddings) != 1 || len(embeddings[0]) != 2 || embeddings[0][1] != 0.2 {
		t.Fatalf("unexpected embeddings: %#v", embeddings)
	}

	scores, err := client.Rerank(context.Background(), "resume task", []string{"first", "second"})
	if err != nil {
		t.Fatalf("Rerank returned an error: %v", err)
	}
	if len(scores) != 2 || scores[0] != 0.2 || scores[1] != 0.9 {
		t.Fatalf("unexpected rerank scores: %#v", scores)
	}
}

func TestVectorLiteralRejectsInvalidValues(t *testing.T) {
	if _, err := vectorLiteral(nil); err == nil {
		t.Fatal("expected empty vector to be rejected")
	}
}
