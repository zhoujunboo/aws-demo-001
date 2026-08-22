package config

import (
	"strings"
	"testing"
)

func TestLoadMatchingAIConfigIsDisabledWhenEmpty(t *testing.T) {
	clearMatchingAIEnvironment(t)

	settings, err := loadMatchingAIConfig()
	if err != nil {
		t.Fatalf("loadMatchingAIConfig returned an error: %v", err)
	}
	if settings.Enabled {
		t.Fatal("expected matching AI to be disabled")
	}
}

func TestLoadMatchingAIConfigRequiresCompleteConfiguration(t *testing.T) {
	clearMatchingAIEnvironment(t)
	t.Setenv("MATCHING_AI_BASE_URL", "https://matching.example/v1")

	_, err := loadMatchingAIConfig()
	if err == nil || !strings.Contains(err.Error(), "must be configured together") {
		t.Fatalf("expected incomplete configuration error, got %v", err)
	}
}

func TestLoadMatchingAIConfigEnablesVectorMatching(t *testing.T) {
	clearMatchingAIEnvironment(t)
	t.Setenv("MATCHING_AI_API_KEY", "test-key")
	t.Setenv("MATCHING_AI_BASE_URL", "https://matching.example/v1")
	t.Setenv("MATCHING_EMBEDDING_MODEL", "embedding-model")
	t.Setenv("MATCHING_RERANK_MODEL", "rerank-model")

	settings, err := loadMatchingAIConfig()
	if err != nil {
		t.Fatalf("loadMatchingAIConfig returned an error: %v", err)
	}
	if !settings.Enabled || settings.EmbeddingModel != "embedding-model" || settings.RerankModel != "rerank-model" {
		t.Fatalf("unexpected matching AI settings: %#v", settings)
	}
}

func clearMatchingAIEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("MATCHING_AI_API_KEY", "")
	t.Setenv("MATCHING_AI_BASE_URL", "")
	t.Setenv("MATCHING_AI_TIMEOUT_SECONDS", "")
	t.Setenv("MATCHING_EMBEDDING_MODEL", "")
	t.Setenv("MATCHING_RERANK_MODEL", "")
	t.Setenv("MATCHING_RERANK_URL", "")
}
