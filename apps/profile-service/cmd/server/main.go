package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/junbozhou88/aws-demo-001/profile-service/internal/config"
	"github.com/junbozhou88/aws-demo-001/profile-service/internal/httpapi"
	"github.com/junbozhou88/aws-demo-001/profile-service/internal/profile"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("profile service stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	settings, err := config.Load()
	if err != nil {
		return err
	}

	poolConfig, err := pgxpool.ParseConfig(settings.DatabaseURL)
	if err != nil {
		return err
	}
	maxConnections, err := config.PositiveInt("DATABASE_MAX_CONNECTIONS", 10)
	if err != nil {
		return err
	}
	poolConfig.MaxConns = maxConnections
	poolConfig.MinConns = 1
	poolConfig.MaxConnIdleTime = 5 * time.Minute
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.HealthCheckPeriod = 30 * time.Second

	startupContext, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelStartup()
	pool, err := pgxpool.NewWithConfig(startupContext, poolConfig)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := pool.Ping(startupContext); err != nil {
		return err
	}

	httpClient := &http.Client{Timeout: settings.RequestTimeout}
	repository := profile.NewPostgresRepository(pool)
	githubClient := profile.NewHTTPGitHubClient(httpClient, settings.GitHubToken)
	profileService := profile.NewService(repository, githubClient)

	server := &http.Server{
		Addr:              settings.Address,
		Handler:           httpapi.NewServer(profileService, settings.AllowedOrigin, logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("profile service listening", "address", settings.Address)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-shutdownContext.Done():
		gracefulContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(gracefulContext)
	}
}
