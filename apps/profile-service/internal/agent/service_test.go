package agent

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type memoryRepository struct {
	agents        []Agent
	dispatchStats map[string]DispatchStat
	embeddings    []AgentEmbedding
	mutex         sync.Mutex
	tasks         map[string]Task
	workflows     map[string]Workflow
}

func (repository *memoryRepository) CreateAgentWithEmbedding(
	_ context.Context,
	registeredAgent Agent,
	embedding AgentEmbedding,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	repository.agents = append(repository.agents, registeredAgent)
	repository.embeddings = append(repository.embeddings, embedding)
	return nil
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
	service := NewService(repository, fakeRunner{}, nil, nil)
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
	service := NewService(&memoryRepository{}, fakeRunner{}, nil, nil)
	_, err := service.CreateTask(context.Background(), CreateTaskInput{Description: "too short"})
	if !errors.Is(err, ErrInvalidTask) {
		t.Fatalf("expected ErrInvalidTask, got %v", err)
	}
}

func TestRegisterAgentStoresAgentAndEmbeddingTogether(t *testing.T) {
	repository := &memoryRepository{}
	service := NewService(
		repository,
		fakeRunner{},
		nil,
		fakeEmbeddingProvider{model: "text-embedding-v3"},
	)
	service.now = func() time.Time {
		return time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)
	}

	result, err := service.RegisterAgent(context.Background(), RegisterAgentInput{
		Capabilities: []string{"resume", "TypeScript", "resume"},
		Description:  "为前端工程师生成突出项目成果的专业简历",
		EndpointURL:  "https://example.com/v1/run",
		ID:           "frontend-resume",
		Name:         "前端简历 Agent",
	})
	if err != nil {
		t.Fatalf("RegisterAgent returned an error: %v", err)
	}
	if result.ID != "frontend-resume" || len(result.Capabilities) != 2 {
		t.Fatalf("unexpected registered agent: %#v", result)
	}
	if len(repository.agents) != 1 || len(repository.embeddings) != 1 {
		t.Fatalf("expected one agent and one embedding to be stored")
	}
	storedEmbedding := repository.embeddings[0]
	if storedEmbedding.AgentID != result.ID || storedEmbedding.Model != "text-embedding-v3" ||
		storedEmbedding.ContentHash == "" || storedEmbedding.SourceText == "" {
		t.Fatalf("unexpected stored embedding: %#v", storedEmbedding)
	}
}

func TestRegisterAgentRejectsInvalidEndpointBeforeEmbedding(t *testing.T) {
	repository := &memoryRepository{}
	service := NewService(
		repository,
		fakeRunner{},
		nil,
		fakeEmbeddingProvider{model: "text-embedding-v3"},
	)

	_, err := service.RegisterAgent(context.Background(), RegisterAgentInput{
		Capabilities: []string{"resume"},
		Description:  "为前端工程师生成突出项目成果的专业简历",
		EndpointURL:  "http://example.com/v1/run",
		ID:           "frontend-resume",
		Name:         "前端简历 Agent",
	})
	if !errors.Is(err, ErrInvalidAgent) {
		t.Fatalf("expected ErrInvalidAgent, got %v", err)
	}
	if len(repository.agents) != 0 || len(repository.embeddings) != 0 {
		t.Fatal("invalid agent must not be stored")
	}
}
