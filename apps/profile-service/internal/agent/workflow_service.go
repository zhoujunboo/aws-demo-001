package agent

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	defaultReliabilityScore = 80
	maxWorkflowDescription  = 8_000
	maxWorkflowSteps        = 3
	nearBestScoreWindow     = 10
)

var (
	ErrInvalidWorkflow       = errors.New("invalid agent workflow")
	ErrWorkflowNotExecutable = errors.New("agent workflow is not executable")
)

type WorkflowSubtask struct {
	Instruction string `json:"instruction"`
	Title       string `json:"title"`
}

type TaskPlanner interface {
	Decompose(context.Context, string) ([]WorkflowSubtask, error)
}

type WorkflowPublisher interface {
	Publish(context.Context, string) error
}

type WorkflowService struct {
	matcher    Matcher
	now        func() time.Time
	planner    TaskPlanner
	publisher  WorkflowPublisher
	repository WorkflowRepository
	runner     Runner
}

func NewWorkflowService(
	repository WorkflowRepository,
	runner Runner,
	matcher Matcher,
	planner TaskPlanner,
	publisher WorkflowPublisher,
) *WorkflowService {
	if matcher == nil {
		matcher = KeywordMatcher{}
	}
	if planner == nil {
		planner = DeterministicTaskPlanner{}
	}
	return &WorkflowService{
		matcher: matcher, now: time.Now, planner: planner, publisher: publisher,
		repository: repository, runner: runner,
	}
}

func (service *WorkflowService) CreatePreview(
	ctx context.Context,
	input CreateWorkflowPreviewInput,
) (Workflow, error) {
	description := strings.TrimSpace(input.Description)
	if utf8.RuneCountInString(description) < 10 || len(description) > maxWorkflowDescription {
		return Workflow{}, ErrInvalidWorkflow
	}
	subtasks, err := service.planner.Decompose(ctx, description)
	if err != nil || len(subtasks) == 0 {
		subtasks, _ = DeterministicTaskPlanner{}.Decompose(ctx, description)
	}
	if len(subtasks) > maxWorkflowSteps {
		subtasks = subtasks[:maxWorkflowSteps]
	}

	agents, err := service.listActiveAgents(ctx)
	if err != nil {
		return Workflow{}, err
	}
	if len(agents) == 0 {
		return Workflow{}, ErrNoAgents
	}
	agentIDs := make([]string, len(agents))
	for index, selectedAgent := range agents {
		agentIDs[index] = selectedAgent.ID
	}
	stats, err := service.repository.GetDispatchStats(ctx, agentIDs)
	if err != nil {
		return Workflow{}, err
	}

	now := service.now().UTC()
	workflow := Workflow{
		CreatedAt: now, Description: description, EstimatedPriceCents: 0,
		ID: newUUID(), Status: "preview", UpdatedAt: now,
	}
	eligibleCounts := make(map[string]int)
	selectedInPlan := make(map[string]int)
	reliabilityTotal := 0
	for index, subtask := range subtasks {
		matches := service.matcher.Match(ctx, agents, CreateTaskInput{Description: subtask.Instruction})
		if len(matches) == 0 {
			return Workflow{}, ErrNoAgents
		}
		for _, match := range matches {
			eligibleCounts[match.Agent.ID]++
		}
		selectedMatch, finalScore := selectFairCandidate(matches, stats, selectedInPlan)
		selectedInPlan[selectedMatch.Agent.ID]++
		reliabilityTotal += reliabilityScore(stats[selectedMatch.Agent.ID])
		workflow.Steps = append(workflow.Steps, WorkflowStep{
			AgentID: selectedMatch.Agent.ID, AgentName: selectedMatch.Agent.Name,
			CreatedAt: now, FairnessScore: finalScore, ID: newUUID(),
			Instruction: subtask.Instruction, MatchScore: selectedMatch.Score,
			Status: "pending", StepOrder: index + 1, Title: subtask.Title,
			UpdatedAt: now, WorkflowID: workflow.ID,
		})
	}
	workflow.ReliabilityScore = reliabilityTotal / len(workflow.Steps)
	if err := service.repository.CreateWorkflow(ctx, workflow, eligibleCounts); err != nil {
		return Workflow{}, err
	}
	return workflow, nil
}

func (service *WorkflowService) GetWorkflow(ctx context.Context, workflowID string) (Workflow, error) {
	if !isUUID(workflowID) {
		return Workflow{}, ErrWorkflowNotFound
	}
	return service.repository.GetWorkflow(ctx, workflowID)
}

func (service *WorkflowService) QueueWorkflow(ctx context.Context, workflowID string) (Workflow, error) {
	workflow, err := service.GetWorkflow(ctx, workflowID)
	if err != nil {
		return Workflow{}, err
	}
	if workflow.Status != "preview" && workflow.Status != "queued" {
		return Workflow{}, ErrWorkflowNotExecutable
	}
	if service.publisher == nil {
		return Workflow{}, errors.New("workflow queue is not configured")
	}
	if workflow.Status == "preview" {
		if err := service.repository.MarkWorkflowQueued(ctx, workflowID); err != nil {
			return Workflow{}, err
		}
	}
	if err := service.publisher.Publish(ctx, workflowID); err != nil {
		return Workflow{}, err
	}
	return service.repository.GetWorkflow(ctx, workflowID)
}

func (service *WorkflowService) StartWorkflow(ctx context.Context, workflowID string) (Workflow, error) {
	if err := service.repository.MarkWorkflowRunning(ctx, workflowID); err != nil {
		return Workflow{}, err
	}
	return service.repository.GetWorkflow(ctx, workflowID)
}

func (service *WorkflowService) RunStep(
	ctx context.Context,
	workflowID string,
	stepID string,
) (Workflow, error) {
	workflow, err := service.GetWorkflow(ctx, workflowID)
	if err != nil {
		return Workflow{}, err
	}
	stepIndex := -1
	for index, step := range workflow.Steps {
		if step.ID == stepID {
			stepIndex = index
			break
		}
	}
	if stepIndex < 0 {
		return Workflow{}, ErrWorkflowNotFound
	}
	step := workflow.Steps[stepIndex]
	if step.Status == "succeeded" {
		return workflow, nil
	}
	if err := service.repository.MarkStepRunning(ctx, step.ID); err != nil {
		return Workflow{}, err
	}

	agents, err := service.listActiveAgents(ctx)
	if err != nil {
		return Workflow{}, err
	}
	var selectedAgent *Agent
	for index := range agents {
		if agents[index].ID == step.AgentID {
			selectedAgent = &agents[index]
			break
		}
	}
	if selectedAgent == nil {
		return Workflow{}, ErrNoAgents
	}
	contextParts := []string{
		"用户原始需求：" + workflow.Description,
		"当前步骤：" + step.Instruction,
	}
	for _, previousStep := range workflow.Steps[:stepIndex] {
		if previousStep.Output != nil {
			contextParts = append(contextParts, fmt.Sprintf(
				"步骤 %d（%s）输出：%s",
				previousStep.StepOrder,
				previousStep.Title,
				*previousStep.Output,
			))
		}
	}
	output, runErr := service.runner.Run(ctx, *selectedAgent, step.ID, CreateTaskInput{
		Description: strings.Join(contextParts, "\n\n"),
	})
	if runErr != nil {
		code := "agent_execution_failed"
		var typedError *RunError
		if errors.As(runErr, &typedError) {
			code = typedError.Code
		}
		step.ErrorCode = &code
		step.Status = "failed"
		if err := service.repository.MarkStepCompleted(ctx, step, false); err != nil {
			return Workflow{}, err
		}
		return service.repository.GetWorkflow(ctx, workflowID)
	}
	step.Output = &output
	step.Status = "succeeded"
	if err := service.repository.MarkStepCompleted(ctx, step, true); err != nil {
		return Workflow{}, err
	}
	return service.repository.GetWorkflow(ctx, workflowID)
}

func (service *WorkflowService) CompleteWorkflow(
	ctx context.Context,
	workflowID string,
	failed bool,
) (Workflow, error) {
	status := "succeeded"
	if failed {
		status = "failed"
	}
	if err := service.repository.CompleteWorkflow(ctx, workflowID, status); err != nil {
		return Workflow{}, err
	}
	return service.repository.GetWorkflow(ctx, workflowID)
}

func (service *WorkflowService) listActiveAgents(ctx context.Context) ([]Agent, error) {
	repository, ok := service.repository.(interface {
		ListAgents(context.Context) ([]Agent, error)
	})
	if !ok {
		return nil, errors.New("workflow repository cannot list agents")
	}
	return repository.ListAgents(ctx)
}

type DeterministicTaskPlanner struct{}

func (DeterministicTaskPlanner) Decompose(_ context.Context, description string) ([]WorkflowSubtask, error) {
	return []WorkflowSubtask{
		{Title: "分析需求", Instruction: "分析用户需求并整理关键目标、约束和执行提纲：" + description},
		{Title: "完成核心任务", Instruction: "根据用户需求和前一步提纲完成核心内容：" + description},
		{Title: "检查与优化", Instruction: "检查前面步骤的结果，修正遗漏并输出最终版本：" + description},
	}, nil
}

func selectFairCandidate(
	matches []Match,
	stats map[string]DispatchStat,
	selectedInPlan map[string]int,
) (Match, int) {
	bestBaseScore := 0
	type scoredCandidate struct {
		baseScore  int
		finalScore int
		match      Match
	}
	candidates := make([]scoredCandidate, 0, len(matches))
	for _, match := range matches {
		reliability := reliabilityScore(stats[match.Agent.ID])
		baseScore := int(math.Round(0.75*float64(match.Score) + 0.25*float64(reliability)))
		if baseScore > bestBaseScore {
			bestBaseScore = baseScore
		}
		selectionCount := stats[match.Agent.ID].SelectedCount
		explorationBonus := int(math.Round(10 / math.Sqrt(float64(selectionCount+1))))
		planPenalty := selectedInPlan[match.Agent.ID] * 8
		candidates = append(candidates, scoredCandidate{
			baseScore: baseScore, finalScore: baseScore + explorationBonus - planPenalty,
			match: match,
		})
	}
	eligible := candidates[:0]
	for _, candidate := range candidates {
		if candidate.baseScore >= bestBaseScore-nearBestScoreWindow {
			eligible = append(eligible, candidate)
		}
	}
	sort.Slice(eligible, func(left, right int) bool {
		if eligible[left].finalScore == eligible[right].finalScore {
			return eligible[left].match.Agent.ID < eligible[right].match.Agent.ID
		}
		return eligible[left].finalScore > eligible[right].finalScore
	})
	return eligible[0].match, max(0, min(100, eligible[0].finalScore))
}

func reliabilityScore(stat DispatchStat) int {
	if stat.ExecutionCount == 0 {
		return defaultReliabilityScore
	}
	return int(math.Round(
		100 * float64(stat.SuccessCount+8) / float64(stat.ExecutionCount+10),
	))
}
