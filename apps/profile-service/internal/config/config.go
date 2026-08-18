package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Address       string
	AllowedOrigin string
	DatabaseURL   string
}

func Load() (Config, error) {
	databaseURL, err := resolveDatabaseURL()
	if err != nil {
		return Config{}, err
	}

	port := valueOrDefault("PORT", "8080")
	return Config{
		Address:       ":" + port,
		AllowedOrigin: valueOrDefault("CORS_ORIGIN", "http://localhost:3001"),
		DatabaseURL:   databaseURL,
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
