package agent

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	maxDescriptionLength = 8_000
	maxResumeLength      = 30_000
)

var (
	ErrInvalidTask = errors.New("invalid agent task")
	ErrNoAgents    = errors.New("no active agents")
)

type Service struct {
	matcher    Matcher
	now        func() time.Time
	repository Repository
	runner     Runner
}

func NewService(repository Repository, runner Runner, matchers ...Matcher) *Service {
	selectedMatcher := Matcher(KeywordMatcher{})
	if len(matchers) > 0 && matchers[0] != nil {
		selectedMatcher = matchers[0]
	}
	return &Service{matcher: selectedMatcher, now: time.Now, repository: repository, runner: runner}
}

func (service *Service) ListAgents(ctx context.Context) ([]Agent, error) {
	return service.repository.ListAgents(ctx)
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
