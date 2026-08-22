package agent

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func (repository *memoryRepository) CreateWorkflow(
	_ context.Context,
	workflow Workflow,
	_ map[string]int,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	if repository.workflows == nil {
		repository.workflows = make(map[string]Workflow)
	}
	repository.workflows[workflow.ID] = workflow
	return nil
}

func (repository *memoryRepository) GetDispatchStats(
	_ context.Context,
	agentIDs []string,
) (map[string]DispatchStat, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	result := make(map[string]DispatchStat, len(agentIDs))
	for _, agentID := range agentIDs {
		result[agentID] = repository.dispatchStats[agentID]
	}
	return result, nil
}

func (repository *memoryRepository) GetWorkflow(
	_ context.Context,
	workflowID string,
) (Workflow, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	workflow, exists := repository.workflows[workflowID]
	if !exists {
		return Workflow{}, ErrWorkflowNotFound
	}
	return workflow, nil
}

func (repository *memoryRepository) MarkWorkflowQueued(
	_ context.Context,
	workflowID string,
) error {
	return repository.updateMemoryWorkflow(workflowID, func(workflow *Workflow) {
		workflow.Status = "queued"
	})
}

func (repository *memoryRepository) MarkWorkflowRunning(
	_ context.Context,
	workflowID string,
) error {
	return repository.updateMemoryWorkflow(workflowID, func(workflow *Workflow) {
		workflow.Status = "running"
	})
}

func (repository *memoryRepository) MarkStepRunning(
	_ context.Context,
	stepID string,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for workflowID, workflow := range repository.workflows {
		for index := range workflow.Steps {
			if workflow.Steps[index].ID == stepID {
				workflow.Steps[index].AttemptCount++
				workflow.Steps[index].Status = "running"
				repository.workflows[workflowID] = workflow
				return nil
			}
		}
	}
	return ErrWorkflowNotFound
}

func (repository *memoryRepository) MarkStepCompleted(
	_ context.Context,
	step WorkflowStep,
	_ bool,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	workflow, exists := repository.workflows[step.WorkflowID]
	if !exists {
		return ErrWorkflowNotFound
	}
	for index := range workflow.Steps {
		if workflow.Steps[index].ID == step.ID {
			step.AttemptCount = workflow.Steps[index].AttemptCount
			workflow.Steps[index] = step
			repository.workflows[workflow.ID] = workflow
			return nil
		}
	}
	return ErrWorkflowNotFound
}

func (repository *memoryRepository) CompleteWorkflow(
	_ context.Context,
	workflowID string,
	status string,
) error {
	return repository.updateMemoryWorkflow(workflowID, func(workflow *Workflow) {
		workflow.Status = status
	})
}

func (repository *memoryRepository) updateMemoryWorkflow(
	workflowID string,
	update func(*Workflow),
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	workflow, exists := repository.workflows[workflowID]
	if !exists {
		return ErrWorkflowNotFound
	}
	update(&workflow)
	repository.workflows[workflowID] = workflow
	return nil
}

type fixedPlanner struct {
	steps []WorkflowSubtask
}

func (planner fixedPlanner) Decompose(_ context.Context, _ string) ([]WorkflowSubtask, error) {
	return planner.steps, nil
}

type fixedMatcher struct{}

func (fixedMatcher) Match(_ context.Context, agents []Agent, _ CreateTaskInput) []Match {
	matches := make([]Match, 0, len(agents))
	for index, selectedAgent := range agents {
		matches = append(matches, Match{
			Agent: selectedAgent,
			Rank:  index + 1,
			Score: 90 - index,
		})
	}
	return matches
}

type recordingRunner struct {
	calls     int
	failFirst bool
	inputs    []CreateTaskInput
}

func (runner *recordingRunner) Run(
	_ context.Context,
	selectedAgent Agent,
	_ string,
	input CreateTaskInput,
) (string, error) {
	runner.calls++
	runner.inputs = append(runner.inputs, input)
	if runner.failFirst && runner.calls == 1 {
		return "", &RunError{Code: "agent_timeout", Err: errors.New("timeout")}
	}
	return "output from " + selectedAgent.ID, nil
}

func TestDeterministicTaskPlannerCreatesSmallOrderedPlan(t *testing.T) {
	steps, err := (DeterministicTaskPlanner{}).Decompose(
		context.Background(),
		"Generate and review a frontend engineer resume",
	)
	if err != nil {
		t.Fatalf("Decompose returned an error: %v", err)
	}
	if len(steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(steps))
	}
	if steps[0].Title != "分析需求" || steps[2].Title != "检查与优化" {
		t.Fatalf("unexpected fallback plan: %#v", steps)
	}
}

func TestFairSelectionGivesNewAgentExplorationOpportunity(t *testing.T) {
	matches := []Match{
		{Agent: Agent{ID: "established"}, Score: 90},
		{Agent: Agent{ID: "new-agent"}, Score: 90},
	}
	stats := map[string]DispatchStat{
		"established": {AgentID: "established", SelectedCount: 100},
		"new-agent":   {AgentID: "new-agent", SelectedCount: 0},
	}

	selected, _ := selectFairCandidate(matches, stats, map[string]int{})
	if selected.Agent.ID != "new-agent" {
		t.Fatalf("expected new agent to receive exploration opportunity, got %s", selected.Agent.ID)
	}
}

func TestFairSelectionDoesNotPromotePoorMatch(t *testing.T) {
	matches := []Match{
		{Agent: Agent{ID: "strong"}, Score: 95},
		{Agent: Agent{ID: "weak-new"}, Score: 55},
	}
	stats := map[string]DispatchStat{
		"strong":   {AgentID: "strong", SelectedCount: 100},
		"weak-new": {AgentID: "weak-new", SelectedCount: 0},
	}

	selected, _ := selectFairCandidate(matches, stats, map[string]int{})
	if selected.Agent.ID != "strong" {
		t.Fatalf("expected relevance guardrail to keep strong match, got %s", selected.Agent.ID)
	}
}

func TestFairSelectionAvoidsRepeatingAgentInPlan(t *testing.T) {
	matches := []Match{
		{Agent: Agent{ID: "agent-a"}, Score: 90},
		{Agent: Agent{ID: "agent-b"}, Score: 90},
	}

	selected, _ := selectFairCandidate(
		matches,
		map[string]DispatchStat{},
		map[string]int{"agent-a": 1},
	)
	if selected.Agent.ID != "agent-b" {
		t.Fatalf("expected plan diversity, got %s", selected.Agent.ID)
	}
}

func TestWorkflowStepCanRetryAndUsesPreviousOutput(t *testing.T) {
	repository := &memoryRepository{
		agents: []Agent{
			{EndpointURL: "https://example.com/one", ID: "agent-a", Name: "Agent A", Status: "active"},
			{EndpointURL: "https://example.com/two", ID: "agent-b", Name: "Agent B", Status: "active"},
		},
		dispatchStats: make(map[string]DispatchStat),
		workflows:     make(map[string]Workflow),
	}
	runner := &recordingRunner{failFirst: true}
	service := NewWorkflowService(
		repository,
		runner,
		fixedMatcher{},
		fixedPlanner{steps: []WorkflowSubtask{
			{Instruction: "Analyze the request in detail", Title: "Analyze"},
			{Instruction: "Create the final result", Title: "Create"},
		}},
		nil,
	)
	service.now = func() time.Time {
		return time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)
	}

	workflow, err := service.CreatePreview(context.Background(), CreateWorkflowPreviewInput{
		Description: "Generate a frontend engineer resume",
	})
	if err != nil {
		t.Fatalf("CreatePreview returned an error: %v", err)
	}

	firstAttempt, err := service.RunStep(context.Background(), workflow.ID, workflow.Steps[0].ID)
	if err != nil {
		t.Fatalf("RunStep returned an error: %v", err)
	}
	if firstAttempt.Steps[0].Status != "failed" {
		t.Fatalf("expected failed first attempt, got %s", firstAttempt.Steps[0].Status)
	}

	retried, err := service.RunStep(context.Background(), workflow.ID, workflow.Steps[0].ID)
	if err != nil {
		t.Fatalf("retry returned an error: %v", err)
	}
	if retried.Steps[0].Status != "succeeded" || retried.Steps[0].AttemptCount != 2 {
		t.Fatalf("unexpected retried step: %#v", retried.Steps[0])
	}

	completed, err := service.RunStep(context.Background(), workflow.ID, workflow.Steps[1].ID)
	if err != nil {
		t.Fatalf("second step returned an error: %v", err)
	}
	if completed.Steps[1].Status != "succeeded" {
		t.Fatalf("expected second step to succeed, got %s", completed.Steps[1].Status)
	}
	lastInput := runner.inputs[len(runner.inputs)-1].Description
	if !strings.Contains(lastInput, "output from agent-a") {
		t.Fatalf("expected previous output in downstream input, got %q", lastInput)
	}
}
