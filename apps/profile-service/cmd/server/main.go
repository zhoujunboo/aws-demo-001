package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/junbozhou88/aws-demo-001/profile-service/internal/agent"
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

	repository := profile.NewPostgresRepository(pool)
	profileService := profile.NewService(repository)
	agentRepository := agent.NewPostgresRepository(pool)
	agentClient := agent.NewClient(settings.AgentAPIKey, settings.AgentTimeout)
	var agentMatcher agent.Matcher = agent.KeywordMatcher{}
	var embeddingProvider agent.EmbeddingProvider
	if settings.MatchingAI.Enabled {
		matchingClient, matchingClientErr := agent.NewMatchingClient(
			settings.MatchingAI.BaseURL,
			settings.MatchingAI.APIKey,
			settings.MatchingAI.EmbeddingModel,
			settings.MatchingAI.RerankModel,
			settings.MatchingAI.RerankURL,
			settings.MatchingAI.Timeout,
		)
		if matchingClientErr != nil {
			return matchingClientErr
		}
		agentMatcher = agent.NewVectorRerankMatcher(agentRepository, matchingClient, matchingClient)
		embeddingProvider = matchingClient
		logger.Info(
			"vector matching enabled",
			"embedding_model", settings.MatchingAI.EmbeddingModel,
			"rerank_model", settings.MatchingAI.RerankModel,
		)
	}
	agentService := agent.NewService(agentRepository, agentClient, agentMatcher, embeddingProvider)
	var taskPlanner agent.TaskPlanner = agent.DeterministicTaskPlanner{}
	if settings.SchedulerAI.Enabled {
		schedulerClient, schedulerClientErr := agent.NewSchedulerClient(
			settings.SchedulerAI.BaseURL,
			settings.SchedulerAI.APIKey,
			settings.SchedulerAI.Model,
			settings.SchedulerAI.Timeout,
		)
		if schedulerClientErr != nil {
			return schedulerClientErr
		}
		taskPlanner = schedulerClient
		logger.Info("LLM workflow scheduler enabled", "model", settings.SchedulerAI.Model)
	}
	var workflowPublisher agent.WorkflowPublisher
	if settings.WorkflowQueueURL != "" {
		awsSettings, awsSettingsErr := awsconfig.LoadDefaultConfig(startupContext)
		if awsSettingsErr != nil {
			return awsSettingsErr
		}
		workflowPublisher, err = agent.NewSQSWorkflowPublisher(
			sqs.NewFromConfig(awsSettings),
			settings.WorkflowQueueURL,
		)
		if err != nil {
			return err
		}
	}
	workflowService := agent.NewWorkflowService(
		agentRepository,
		agentClient,
		agentMatcher,
		taskPlanner,
		workflowPublisher,
	)

	server := &http.Server{
		Addr:              settings.Address,
		Handler:           httpapi.NewServer(profileService, agentService, workflowService, settings.AllowedOrigin, logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      settings.AgentTimeout + 15*time.Second,
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
