package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AgentAPIKey   string
	AgentTimeout  time.Duration
	Address       string
	AllowedOrigin string
	DatabaseURL   string
	MatchingAI    MatchingAIConfig
}

type MatchingAIConfig struct {
	APIKey         string
	BaseURL        string
	EmbeddingModel string
	Enabled        bool
	RerankModel    string
	RerankURL      string
	Timeout        time.Duration
}

func Load() (Config, error) {
	databaseURL, err := resolveDatabaseURL()
	if err != nil {
		return Config{}, err
	}
	agentAPIKey := strings.TrimSpace(os.Getenv("AGENT_API_KEY"))
	if agentAPIKey == "" {
		return Config{}, fmt.Errorf("AGENT_API_KEY is required")
	}
	agentTimeoutSeconds, err := PositiveInt("AGENT_TIMEOUT_SECONDS", 60)
	if err != nil {
		return Config{}, err
	}
	matchingAI, err := loadMatchingAIConfig()
	if err != nil {
		return Config{}, err
	}

	port := valueOrDefault("PORT", "8080")
	return Config{
		AgentAPIKey:   agentAPIKey,
		AgentTimeout:  time.Duration(agentTimeoutSeconds) * time.Second,
		Address:       ":" + port,
		AllowedOrigin: valueOrDefault("CORS_ORIGIN", "http://localhost:3001"),
		DatabaseURL:   databaseURL,
		MatchingAI:    matchingAI,
	}, nil
}

func loadMatchingAIConfig() (MatchingAIConfig, error) {
	apiKey := strings.TrimSpace(os.Getenv("MATCHING_AI_API_KEY"))
	baseURL := strings.TrimSpace(os.Getenv("MATCHING_AI_BASE_URL"))
	embeddingModel := strings.TrimSpace(os.Getenv("MATCHING_EMBEDDING_MODEL"))
	rerankModel := strings.TrimSpace(os.Getenv("MATCHING_RERANK_MODEL"))
	rerankURL := strings.TrimSpace(os.Getenv("MATCHING_RERANK_URL"))
	values := []string{apiKey, baseURL, embeddingModel, rerankModel}
	configuredValues := 0
	for _, value := range values {
		if value != "" {
			configuredValues++
		}
	}
	if configuredValues == 0 {
		return MatchingAIConfig{}, nil
	}
	if configuredValues != len(values) {
		return MatchingAIConfig{}, fmt.Errorf(
			"MATCHING_AI_API_KEY, MATCHING_AI_BASE_URL, MATCHING_EMBEDDING_MODEL, and MATCHING_RERANK_MODEL must be configured together",
		)
	}
	timeoutSeconds, err := PositiveInt("MATCHING_AI_TIMEOUT_SECONDS", 10)
	if err != nil {
		return MatchingAIConfig{}, err
	}
	return MatchingAIConfig{
		APIKey:         apiKey,
		BaseURL:        baseURL,
		EmbeddingModel: embeddingModel,
		Enabled:        true,
		RerankModel:    rerankModel,
		RerankURL:      rerankURL,
		Timeout:        time.Duration(timeoutSeconds) * time.Second,
	}, nil
}

func resolveDatabaseURL() (string, error) {
	if databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL")); databaseURL != "" {
		return databaseURL, nil
	}

	host := strings.TrimSpace(os.Getenv("DATABASE_HOST"))
	name := strings.TrimSpace(os.Getenv("DATABASE_NAME"))
	password := os.Getenv("DATABASE_PASSWORD")
	username := strings.TrimSpace(os.Getenv("DATABASE_USERNAME"))
	if host == "" || name == "" || password == "" || username == "" {
		return "", fmt.Errorf("DATABASE_URL or all DATABASE_HOST, DATABASE_NAME, DATABASE_PASSWORD, and DATABASE_USERNAME values are required")
	}

	port := valueOrDefault("DATABASE_PORT", "5432")
	sslMode := valueOrDefault("DATABASE_SSLMODE", "require")
	connectionURL := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(username, password),
		Host:   host + ":" + port,
		Path:   name,
	}
	query := connectionURL.Query()
	query.Set("sslmode", sslMode)
	connectionURL.RawQuery = query.Encode()
	return connectionURL.String(), nil
}

func valueOrDefault(name, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func PositiveInt(name string, fallback int32) (int32, error) {
	rawValue := strings.TrimSpace(os.Getenv(name))
	if rawValue == "" {
		return fallback, nil
	}

	value, err := strconv.ParseInt(rawValue, 10, 32)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return int32(value), nil
}
