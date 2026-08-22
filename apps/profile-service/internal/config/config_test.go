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

func TestLoadSchedulerAIConfigIsDisabledWhenEmpty(t *testing.T) {
	clearSchedulerAIEnvironment(t)

	settings, err := loadSchedulerAIConfig()
	if err != nil {
		t.Fatalf("loadSchedulerAIConfig returned an error: %v", err)
	}
	if settings.Enabled {
		t.Fatal("expected scheduler AI to be disabled")
	}
}

func TestLoadSchedulerAIConfigSupportsOpenAIEnvironment(t *testing.T) {
	clearSchedulerAIEnvironment(t)
	t.Setenv("OPENAI_API_KEY", "openai-key")
	t.Setenv("OPENAI_BASE_URL", "https://openai.example")
	t.Setenv("OPENAI_MODEL", "openai-model")

	settings, err := loadSchedulerAIConfig()
	if err != nil {
		t.Fatalf("loadSchedulerAIConfig returned an error: %v", err)
	}
	if !settings.Enabled || settings.APIKey != "openai-key" ||
		settings.BaseURL != "https://openai.example" || settings.Model != "openai-model" {
		t.Fatalf("unexpected scheduler AI settings: %#v", settings)
	}
}

func TestLoadSchedulerAIConfigPrefersSchedulerEnvironment(t *testing.T) {
	clearSchedulerAIEnvironment(t)
	t.Setenv("OPENAI_API_KEY", "openai-key")
	t.Setenv("OPENAI_BASE_URL", "https://openai.example")
	t.Setenv("OPENAI_MODEL", "openai-model")
	t.Setenv("SCHEDULER_AI_API_KEY", "scheduler-key")
	t.Setenv("SCHEDULER_AI_BASE_URL", "https://scheduler.example/v1")
	t.Setenv("SCHEDULER_AI_MODEL", "scheduler-model")

	settings, err := loadSchedulerAIConfig()
	if err != nil {
		t.Fatalf("loadSchedulerAIConfig returned an error: %v", err)
	}
	if settings.APIKey != "scheduler-key" || settings.BaseURL != "https://scheduler.example/v1" ||
		settings.Model != "scheduler-model" {
		t.Fatalf("unexpected scheduler AI settings: %#v", settings)
	}
}

func TestLoadSchedulerAIConfigRequiresCompleteConfiguration(t *testing.T) {
	clearSchedulerAIEnvironment(t)
	t.Setenv("OPENAI_API_KEY", "openai-key")

	_, err := loadSchedulerAIConfig()
	if err == nil || !strings.Contains(err.Error(), "must be configured together") {
		t.Fatalf("expected incomplete configuration error, got %v", err)
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

func clearSchedulerAIEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OPENAI_BASE_URL", "")
	t.Setenv("OPENAI_MODEL", "")
	t.Setenv("SCHEDULER_AI_API_KEY", "")
	t.Setenv("SCHEDULER_AI_BASE_URL", "")
	t.Setenv("SCHEDULER_AI_MODEL", "")
	t.Setenv("SCHEDULER_AI_TIMEOUT_SECONDS", "")
}
