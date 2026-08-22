package agent

import (
	"context"
	"errors"
	"testing"
)

type fakeEmbeddingProvider struct {
	err   error
	model string
}

func (provider fakeEmbeddingProvider) EmbeddingModel() string {
	return provider.model
}

func (provider fakeEmbeddingProvider) Embed(_ context.Context, texts []string) ([][]float64, error) {
	if provider.err != nil {
		return nil, provider.err
	}
	embeddings := make([][]float64, len(texts))
	for index := range texts {
		embeddings[index] = []float64{float64(index + 1), 0.5}
	}
	return embeddings, nil
}

type fakeRerankProvider struct {
	scores []float64
}

func (provider fakeRerankProvider) Rerank(_ context.Context, _ string, _ []string) ([]float64, error) {
	return provider.scores, nil
}

type vectorRepository struct {
	*memoryRepository
	candidates []VectorCandidate
	embeddings []AgentEmbedding
	metadata   map[string]EmbeddingMetadata
}

func (repository *vectorRepository) ListAgentEmbeddingMetadata(_ context.Context) (map[string]EmbeddingMetadata, error) {
	return repository.metadata, nil
}

func (repository *vectorRepository) UpsertAgentEmbeddings(_ context.Context, embeddings []AgentEmbedding) error {
	repository.embeddings = embeddings
	return nil
}

func (repository *vectorRepository) SearchAgentsByEmbedding(
	_ context.Context,
	_ string,
	_ []float64,
	_ int,
) ([]VectorCandidate, error) {
	return repository.candidates, nil
}

func TestVectorRerankMatcherUsesRerankScores(t *testing.T) {
	agents := []Agent{
		{ID: "vector-first", Name: "Vector", Description: "vector result", Status: "active"},
		{ID: "rerank-first", Name: "Rerank", Description: "rerank result", Status: "active"},
	}
	repository := &vectorRepository{
		memoryRepository: &memoryRepository{agents: agents},
		candidates: []VectorCandidate{
			{Agent: agents[0], Similarity: 0.95},
			{Agent: agents[1], Similarity: 0.75},
		},
		metadata: map[string]EmbeddingMetadata{},
	}
	matcher := NewVectorRerankMatcher(
		repository,
		fakeEmbeddingProvider{model: "embedding-model"},
		fakeRerankProvider{scores: []float64{0.1, 0.95}},
	)

	matches := matcher.Match(context.Background(), agents, CreateTaskInput{
		Description: "Generate a resume for a frontend engineer",
	})

	if len(repository.embeddings) != 2 {
		t.Fatalf("expected 2 embeddings to be stored, got %d", len(repository.embeddings))
	}
	if len(matches) != 2 || matches[0].Agent.ID != "rerank-first" {
		t.Fatalf("expected rerank-first to rank first, got %#v", matches)
	}
	if matches[0].Rank != 1 || matches[1].Rank != 2 {
		t.Fatalf("unexpected ranks: %#v", matches)
	}
}

func TestVectorRerankMatcherFallsBackToKeywords(t *testing.T) {
	agents := testAgents()
	repository := &vectorRepository{
		memoryRepository: &memoryRepository{agents: agents},
		metadata:         map[string]EmbeddingMetadata{},
	}
	matcher := NewVectorRerankMatcher(
		repository,
		fakeEmbeddingProvider{err: errors.New("embedding unavailable"), model: "embedding-model"},
		fakeRerankProvider{},
	)

	matches := matcher.Match(context.Background(), agents, CreateTaskInput{
		Description: "请针对岗位 JD 优化 ATS 关键词匹配",
	})

	if len(matches) != 3 || matches[0].Agent.ID != "ats-resume" {
		t.Fatalf("expected keyword fallback to rank ats-resume first, got %#v", matches)
	}
}
