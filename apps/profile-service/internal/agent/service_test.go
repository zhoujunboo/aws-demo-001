package agent

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type memoryRepository struct {
	agents []Agent
	mutex  sync.Mutex
	tasks  map[string]Task
}

func (repository *memoryRepository) ListAgents(_ context.Context) ([]Agent, error) {
	return repository.agents, nil
}

func (repository *memoryRepository) ListAgentEmbeddingMetadata(_ context.Context) (map[string]EmbeddingMetadata, error) {
	return map[string]EmbeddingMetadata{}, nil
}

func (repository *memoryRepository) UpsertAgentEmbeddings(_ context.Context, _ []AgentEmbedding) error {
	return nil
}

func (repository *memoryRepository) SearchAgentsByEmbedding(
	_ context.Context,
	_ string,
	_ []float64,
	_ int,
) ([]VectorCandidate, error) {
	return nil, nil
}

func (repository *memoryRepository) CreateTask(_ context.Context, task Task) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	repository.tasks[task.ID] = task
	return nil
}

func (repository *memoryRepository) UpdateExecution(_ context.Context, execution Execution) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	task := repository.tasks[execution.TaskID]
	for index := range task.Executions {
		if task.Executions[index].ID == execution.ID {
			task.Executions[index] = execution
			repository.tasks[task.ID] = task
			return nil
		}
	}
	return ErrTaskNotFound
}

func (repository *memoryRepository) CompleteTask(_ context.Context, taskID, status string) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	task, exists := repository.tasks[taskID]
	if !exists {
		return ErrTaskNotFound
	}
	now := time.Now().UTC()
	task.CompletedAt = &now
	task.Status = status
	task.UpdatedAt = now
	repository.tasks[taskID] = task
	return nil
}

func (repository *memoryRepository) GetTask(_ context.Context, taskID string) (Task, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	task, exists := repository.tasks[taskID]
	if !exists {
		return Task{}, ErrTaskNotFound
	}
	return task, nil
}

type fakeRunner struct{}

func (fakeRunner) Run(_ context.Context, selectedAgent Agent, _ string, _ CreateTaskInput) (string, error) {
	if selectedAgent.ID == "resume-polisher" {
		return "", &RunError{Code: "agent_timeout", Err: errors.New("timeout")}
	}
	return "output from " + selectedAgent.ID, nil
}

func TestCreateTaskKeepsIndependentAgentResults(t *testing.T) {
	repository := &memoryRepository{
		agents: []Agent{
			{ID: "tech-resume", Name: "Tech", Status: "active"},
			{ID: "ats-resume", Name: "ATS", Status: "active"},
			{ID: "resume-polisher", Name: "Polisher", Status: "active"},
		},
		tasks: make(map[string]Task),
	}
	service := NewService(repository, fakeRunner{})
	service.now = func() time.Time {
		return time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)
	}

	result, err := service.CreateTask(context.Background(), CreateTaskInput{
		Description: "Generate a TypeScript engineer resume",
	})
	if err != nil {
		t.Fatalf("CreateTask returned an error: %v", err)
	}
	if result.Status != "completed_with_errors" {
		t.Fatalf("unexpected task status: %q", result.Status)
	}
	if len(result.Executions) != 3 {
		t.Fatalf("expected 3 executions, got %d", len(result.Executions))
	}

	succeeded := 0
	failed := 0
	for _, execution := range result.Executions {
		switch execution.Status {
		case "succeeded":
			succeeded++
		case "failed":
			failed++
			if execution.ErrorCode == nil || *execution.ErrorCode != "agent_timeout" {
				t.Fatalf("unexpected error code: %v", execution.ErrorCode)
			}
		}
	}
	if succeeded != 2 || failed != 1 {
		t.Fatalf("unexpected result counts: %d succeeded, %d failed", succeeded, failed)
	}
}

func TestCreateTaskRejectsShortDescription(t *testing.T) {
	service := NewService(&memoryRepository{}, fakeRunner{})
	_, err := service.CreateTask(context.Background(), CreateTaskInput{Description: "too short"})
	if !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("expected ErrInvalidTask, got %v", err)
	}
}
