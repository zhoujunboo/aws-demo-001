package agent

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	maxAgentDescriptionLength = 1_000
	maxAgentNameLength        = 80
	maxCapabilities           = 12
	maxDescriptionLength      = 8_000
	maxResumeLength           = 30_000
)

var agentIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`)

var (
	ErrInvalidAgent      = errors.New("invalid agent registration")
	ErrInvalidTask       = errors.New("invalid agent task")
	ErrNoAgents          = errors.New("no active agents")
	ErrVectorUnavailable = errors.New("agent embedding is unavailable")
)

type Service struct {
	embedder   EmbeddingProvider
	matcher    Matcher
	now        func() time.Time
	repository Repository
	runner     Runner
}

func NewService(
	repository Repository,
	runner Runner,
	matcher Matcher,
	embedder EmbeddingProvider,
) *Service {
	selectedMatcher := Matcher(KeywordMatcher{})
	if matcher != nil {
		selectedMatcher = matcher
	}
	return &Service{
		embedder: embedder, matcher: selectedMatcher, now: time.Now,
		repository: repository, runner: runner,
	}
}

func (service *Service) ListAgents(ctx context.Context) ([]Agent, error) {
	return service.repository.ListAgents(ctx)
}

func (service *Service) RegisterAgent(ctx context.Context, input RegisterAgentInput) (Agent, error) {
	registeredAgent, err := validateAgentRegistration(input, service.now().UTC())
	if err != nil {
		return Agent{}, err
	}
	if service.embedder == nil {
		return Agent{}, ErrVectorUnavailable
	}

	sourceText := buildAgentSourceText(registeredAgent)
	embeddings, err := service.embedder.Embed(ctx, []string{sourceText})
	if err != nil {
		return Agent{}, fmt.Errorf("%w: %v", ErrVectorUnavailable, err)
	}
	if len(embeddings) != 1 || len(embeddings[0]) == 0 {
		return Agent{}, ErrVectorUnavailable
	}
	embedding := AgentEmbedding{
		AgentID:     registeredAgent.ID,
		ContentHash: fmt.Sprintf("%x", sha256.Sum256([]byte(sourceText))),
		Embedding:   embeddings[0],
		Model:       service.embedder.EmbeddingModel(),
		SourceText:  sourceText,
	}
	if err := service.repository.CreateAgentWithEmbedding(ctx, registeredAgent, embedding); err != nil {
		return Agent{}, err
	}
	return registeredAgent, nil
}

func validateAgentRegistration(input RegisterAgentInput, now time.Time) (Agent, error) {
	id := strings.TrimSpace(input.ID)
	name := strings.TrimSpace(input.Name)
	description := strings.TrimSpace(input.Description)
	endpointURL := strings.TrimSpace(input.EndpointURL)
	parsedURL, err := url.Parse(endpointURL)
	isLocalHTTP := err == nil && parsedURL.Scheme == "http" &&
		(parsedURL.Hostname() == "localhost" || parsedURL.Hostname() == "127.0.0.1" || parsedURL.Hostname() == "::1")
	isValidEndpoint := err == nil && parsedURL.Host != "" && (parsedURL.Scheme == "https" || isLocalHTTP)
	if !agentIDPattern.MatchString(id) || utf8.RuneCountInString(name) < 2 ||
		utf8.RuneCountInString(name) > maxAgentNameLength || utf8.RuneCountInString(description) < 10 ||
		utf8.RuneCountInString(description) > maxAgentDescriptionLength || !isValidEndpoint {
		return Agent{}, ErrInvalidAgent
	}

	capabilities := make([]string, 0, len(input.Capabilities))
	seenCapabilities := make(map[string]struct{}, len(input.Capabilities))
	for _, capability := range input.Capabilities {
		trimmedCapability := strings.TrimSpace(capability)
		normalizedCapability := strings.ToLower(trimmedCapability)
		if trimmedCapability == "" || utf8.RuneCountInString(trimmedCapability) > 40 {
			return Agent{}, ErrInvalidAgent
		}
		if _, exists := seenCapabilities[normalizedCapability]; exists {
			continue
		}
		seenCapabilities[normalizedCapability] = struct{}{}
		capabilities = append(capabilities, trimmedCapability)
	}
	if len(capabilities) == 0 || len(capabilities) > maxCapabilities {
		return Agent{}, ErrInvalidAgent
	}

	return Agent{
		Capabilities: capabilities, CreatedAt: now, Description: description,
		EndpointURL: endpointURL, ID: id, Name: name, Status: "active", UpdatedAt: now,
	}, nil
}

func (service *Service) CreateTask(ctx context.Context, input CreateTaskInput) (Task, error) {
	input.Description = strings.TrimSpace(input.Description)
	if input.Resume != nil {
		trimmedResume := strings.TrimSpace(*input.Resume)
		input.Resume = &trimmedResume
	}
	if utf8.RuneCountInString(input.Description) < 10 || len(input.Description) > maxDescriptionLength ||
		(input.Resume != nil && len(*input.Resume) > maxResumeLength) {
		return Task{}, ErrInvalidTask
	}

	agents, err := service.repository.ListAgents(ctx)
	if err != nil {
		return Task{}, err
	}
	matches := service.matcher.Match(ctx, agents, input)
	if len(matches) == 0 {
		return Task{}, ErrNoAgents
	}

	now := service.now().UTC()
	task := Task{
		CreatedAt:   now,
		Description: input.Description,
		Executions:  make([]Execution, 0, len(matches)),
		ID:          newUUID(),
		Resume:      input.Resume,
		Status:      "running",
		UpdatedAt:   now,
	}
	for _, match := range matches {
		task.Executions = append(task.Executions, Execution{
			AgentID:   match.Agent.ID,
			AgentName: match.Agent.Name,
			CreatedAt: now,
			ID:        newUUID(),
			Rank:      match.Rank,
			Score:     match.Score,
			Status:    "pending",
			TaskID:    task.ID,
		})
	}
	if err := service.repository.CreateTask(ctx, task); err != nil {
		return Task{}, err
	}
	executionContext := context.WithoutCancel(ctx)

	type runResult struct {
		execution Execution
	}
	results := make(chan runResult, len(matches))
	var waitGroup sync.WaitGroup
	for index, match := range matches {
		execution := task.Executions[index]
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			startedAt := service.now()
			output, runErr := service.runner.Run(executionContext, match.Agent, execution.ID, input)
			completedAt := service.now().UTC()
			duration := int(completedAt.Sub(startedAt).Milliseconds())
			execution.CompletedAt = &completedAt
			execution.DurationMS = &duration
			if runErr == nil {
				execution.Output = &output
				execution.Status = "succeeded"
			} else {
				code := "agent_execution_failed"
				var typedError *RunError
				if errors.As(runErr, &typedError) {
					code = typedError.Code
				}
				execution.ErrorCode = &code
				execution.Status = "failed"
			}
			results <- runResult{execution: execution}
		}()
	}
	waitGroup.Wait()
	close(results)

	succeeded := 0
	failed := 0
	for result := range results {
		if err := service.repository.UpdateExecution(executionContext, result.execution); err != nil {
			return Task{}, err
		}
		if result.execution.Status == "succeeded" {
			succeeded++
		} else {
			failed++
		}
	}

	status := "succeeded"
	if succeeded == 0 {
		status = "failed"
	} else if failed > 0 {
		status = "completed_with_errors"
	}
	if err := service.repository.CompleteTask(executionContext, task.ID, status); err != nil {
		return Task{}, err
	}
	return service.repository.GetTask(executionContext, task.ID)
}

func (service *Service) GetTask(ctx context.Context, taskID string) (Task, error) {
	if !isUUID(taskID) {
		return Task{}, ErrTaskNotFound
	}
	return service.repository.GetTask(ctx, taskID)
}

func newUUID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Sprintf("generate UUID: %v", err))
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}

func isUUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if character != '-' {
				return false
			}
			continue
		}
		if !((character >= '0' && character <= '9') ||
			(character >= 'a' && character <= 'f') ||
			(character >= 'A' && character <= 'F')) {
			return false
		}
	}
	return true
}
