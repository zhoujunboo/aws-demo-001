package agent

import (
	"context"
	"crypto/sha256"
	"fmt"
	"math"
	"sort"
	"strings"
)

const maxVectorCandidates = 10

type Matcher interface {
	Match(context.Context, []Agent, CreateTaskInput) []Match
}

type KeywordMatcher struct{}

func (KeywordMatcher) Match(_ context.Context, agents []Agent, input CreateTaskInput) []Match {
	return MatchAgents(agents, input)
}

type VectorRerankMatcher struct {
	embedder   EmbeddingProvider
	repository Repository
	reranker   RerankProvider
}

func NewVectorRerankMatcher(
	repository Repository,
	embedder EmbeddingProvider,
	reranker RerankProvider,
) *VectorRerankMatcher {
	return &VectorRerankMatcher{repository: repository, embedder: embedder, reranker: reranker}
}

func (matcher *VectorRerankMatcher) Match(
	ctx context.Context,
	agents []Agent,
	input CreateTaskInput,
) []Match {
	if err := matcher.syncAgentEmbeddings(ctx, agents); err != nil {
		return MatchAgents(agents, input)
	}

	query := buildTaskQuery(input)
	embeddings, err := matcher.embedder.Embed(ctx, []string{query})
	if err != nil || len(embeddings) != 1 {
		return MatchAgents(agents, input)
	}
	candidates, err := matcher.repository.SearchAgentsByEmbedding(
		ctx,
		matcher.embedder.EmbeddingModel(),
		embeddings[0],
		maxVectorCandidates,
	)
	if err != nil || len(candidates) == 0 {
		return MatchAgents(agents, input)
	}

	documents := make([]string, len(candidates))
	for index, candidate := range candidates {
		documents[index] = buildAgentSourceText(candidate.Agent)
	}
	rerankScores, err := matcher.reranker.Rerank(ctx, query, documents)
	if err != nil || len(rerankScores) != len(candidates) {
		return vectorMatches(candidates, nil)
	}
	return vectorMatches(candidates, rerankScores)
}

func (matcher *VectorRerankMatcher) syncAgentEmbeddings(ctx context.Context, agents []Agent) error {
	metadata, err := matcher.repository.ListAgentEmbeddingMetadata(ctx)
	if err != nil {
		return err
	}

	pendingAgents := make([]Agent, 0, len(agents))
	sourceTexts := make([]string, 0, len(agents))
	contentHashes := make([]string, 0, len(agents))
	for _, selectedAgent := range agents {
		if selectedAgent.Status != "active" {
			continue
		}
		sourceText := buildAgentSourceText(selectedAgent)
		contentHash := fmt.Sprintf("%x", sha256.Sum256([]byte(sourceText)))
		storedMetadata, exists := metadata[selectedAgent.ID]
		isCurrent := exists && storedMetadata.ContentHash == contentHash &&
			storedMetadata.Model == matcher.embedder.EmbeddingModel()
		if isCurrent {
			continue
		}
		pendingAgents = append(pendingAgents, selectedAgent)
		sourceTexts = append(sourceTexts, sourceText)
		contentHashes = append(contentHashes, contentHash)
	}
	if len(pendingAgents) == 0 {
		return nil
	}

	embeddings, err := matcher.embedder.Embed(ctx, sourceTexts)
	if err != nil {
		return err
	}
	if len(embeddings) != len(pendingAgents) {
		return fmt.Errorf("received %d embeddings for %d agents", len(embeddings), len(pendingAgents))
	}
	records := make([]AgentEmbedding, len(pendingAgents))
	for index, selectedAgent := range pendingAgents {
		records[index] = AgentEmbedding{
			AgentID:     selectedAgent.ID,
			ContentHash: contentHashes[index],
			Embedding:   embeddings[index],
			Model:       matcher.embedder.EmbeddingModel(),
			SourceText:  sourceTexts[index],
		}
	}
	return matcher.repository.UpsertAgentEmbeddings(ctx, records)
}

func buildAgentSourceText(selectedAgent Agent) string {
	return fmt.Sprintf(
		"Agent: %s\nDescription: %s\nCapabilities: %s",
		selectedAgent.Name,
		selectedAgent.Description,
		strings.Join(selectedAgent.Capabilities, ", "),
	)
}

func buildTaskQuery(input CreateTaskInput) string {
	parts := []string{"Task: " + input.Description}
	if input.Resume != nil && strings.TrimSpace(*input.Resume) != "" {
		parts = append(parts, "Existing resume: "+truncateRunes(*input.Resume, 4_000))
	}
	return strings.Join(parts, "\n")
}

func truncateRunes(value string, limit int) string {
	characters := []rune(value)
	if len(characters) <= limit {
		return value
	}
	return string(characters[:limit])
}

func vectorMatches(candidates []VectorCandidate, rerankScores []float64) []Match {
	matches := make([]Match, len(candidates))
	for index, candidate := range candidates {
		vectorScore := clampScore((candidate.Similarity + 1) / 2)
		finalScore := vectorScore
		if rerankScores != nil {
			finalScore = 0.3*vectorScore + 0.7*clampScore(rerankScores[index])
		}
		matches[index] = Match{Agent: candidate.Agent, Score: int(math.Round(finalScore * 100))}
	}
	sort.Slice(matches, func(left, right int) bool {
		if matches[left].Score == matches[right].Score {
			return matches[left].Agent.ID < matches[right].Agent.ID
		}
		return matches[left].Score > matches[right].Score
	})
	if len(matches) > maxMatchedAgents {
		matches = matches[:maxMatchedAgents]
	}
	for index := range matches {
		matches[index].Rank = index + 1
	}
	return matches
}

func clampScore(score float64) float64 {
	return math.Max(0, math.Min(1, score))
}
