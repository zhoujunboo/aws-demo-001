package agent

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrWorkflowNotFound = errors.New("agent workflow not found")

type WorkflowRepository interface {
	CompleteWorkflow(context.Context, string, string) error
	CreateWorkflow(context.Context, Workflow, map[string]int) error
	GetDispatchStats(context.Context, []string) (map[string]DispatchStat, error)
	GetWorkflow(context.Context, string) (Workflow, error)
	MarkStepCompleted(context.Context, WorkflowStep, bool) error
	MarkStepRunning(context.Context, string) error
	MarkWorkflowQueued(context.Context, string) error
	MarkWorkflowRunning(context.Context, string) error
}

func (repository *PostgresRepository) CreateWorkflow(
	ctx context.Context,
	workflow Workflow,
	eligibleCounts map[string]int,
) error {
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin workflow transaction: %w", err)
	}
	defer transaction.Rollback(ctx)

	_, err = transaction.Exec(ctx, `
		INSERT INTO agent_workflow (
			created_at, description, estimated_price_cents, id,
			reliability_score, status, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, workflow.CreatedAt, workflow.Description, workflow.EstimatedPriceCents,
		workflow.ID, workflow.ReliabilityScore, workflow.Status, workflow.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create workflow: %w", err)
	}

	selectedCounts := make(map[string]int)
	for _, step := range workflow.Steps {
		_, err = transaction.Exec(ctx, `
			INSERT INTO agent_workflow_step (
				agent_id, agent_name, attempt_count, created_at, fairness_score,
				id, instruction, match_score, status, step_order, title,
				updated_at, workflow_id
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`, step.AgentID, step.AgentName, step.AttemptCount, step.CreatedAt,
			step.FairnessScore, step.ID, step.Instruction, step.MatchScore,
			step.Status, step.StepOrder, step.Title, step.UpdatedAt, step.WorkflowID)
		if err != nil {
			return fmt.Errorf("create workflow step: %w", err)
		}
		selectedCounts[step.AgentID]++
	}

	for agentID, eligibleCount := range eligibleCounts {
		_, err = transaction.Exec(ctx, `
			INSERT INTO agent_dispatch_stat (
				agent_id, eligible_count, last_selected_at, selected_count
			)
			VALUES ($1, $2, CASE WHEN $3 > 0 THEN $4 ELSE NULL END, $3)
			ON CONFLICT (agent_id) DO UPDATE SET
				eligible_count = agent_dispatch_stat.eligible_count + EXCLUDED.eligible_count,
				last_selected_at = CASE
					WHEN EXCLUDED.selected_count > 0 THEN EXCLUDED.last_selected_at
					ELSE agent_dispatch_stat.last_selected_at
				END,
				selected_count = agent_dispatch_stat.selected_count + EXCLUDED.selected_count,
				updated_at = now()
		`, agentID, eligibleCount, selectedCounts[agentID], workflow.CreatedAt)
		if err != nil {
			return fmt.Errorf("update dispatch stats: %w", err)
		}
	}

	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("commit workflow transaction: %w", err)
	}
	return nil
}

func (repository *PostgresRepository) GetDispatchStats(
	ctx context.Context,
	agentIDs []string,
) (map[string]DispatchStat, error) {
	stats := make(map[string]DispatchStat, len(agentIDs))
	if len(agentIDs) == 0 {
		return stats, nil
	}
	rows, err := repository.pool.Query(ctx, `
		SELECT agent_id, eligible_count, execution_count, selected_count, success_count
		FROM agent_dispatch_stat
		WHERE agent_id = ANY($1)
	`, agentIDs)
	if err != nil {
		return nil, fmt.Errorf("get dispatch stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var stat DispatchStat
		if err := rows.Scan(
			&stat.AgentID, &stat.EligibleCount, &stat.ExecutionCount,
			&stat.SelectedCount, &stat.SuccessCount,
		); err != nil {
			return nil, fmt.Errorf("scan dispatch stat: %w", err)
		}
		stats[stat.AgentID] = stat
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate dispatch stats: %w", err)
	}
	return stats, nil
}

func (repository *PostgresRepository) GetWorkflow(ctx context.Context, workflowID string) (Workflow, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT completed_at, created_at, description, estimated_price_cents, id,
		       reliability_score, started_at, status, updated_at
		FROM agent_workflow
		WHERE id = $1
	`, workflowID)
	var workflow Workflow
	if err := row.Scan(
		&workflow.CompletedAt, &workflow.CreatedAt, &workflow.Description,
		&workflow.EstimatedPriceCents, &workflow.ID, &workflow.ReliabilityScore,
		&workflow.StartedAt, &workflow.Status, &workflow.UpdatedAt,
	); errors.Is(err, pgx.ErrNoRows) {
		return Workflow{}, ErrWorkflowNotFound
	} else if err != nil {
		return Workflow{}, fmt.Errorf("get workflow: %w", err)
	}

	rows, err := repository.pool.Query(ctx, `
		SELECT agent_id, agent_name, attempt_count, completed_at, created_at,
		       error_code, fairness_score, id, instruction, match_score, output,
		       started_at, status, step_order, title, updated_at, workflow_id
		FROM agent_workflow_step
		WHERE workflow_id = $1
		ORDER BY step_order
	`, workflowID)
	if err != nil {
		return Workflow{}, fmt.Errorf("list workflow steps: %w", err)
	}
	defer rows.Close()
	workflow.Steps = make([]WorkflowStep, 0)
	for rows.Next() {
		var step WorkflowStep
		if err := rows.Scan(
			&step.AgentID, &step.AgentName, &step.AttemptCount, &step.CompletedAt,
			&step.CreatedAt, &step.ErrorCode, &step.FairnessScore, &step.ID,
			&step.Instruction, &step.MatchScore, &step.Output, &step.StartedAt,
			&step.Status, &step.StepOrder, &step.Title, &step.UpdatedAt,
			&step.WorkflowID,
		); err != nil {
			return Workflow{}, fmt.Errorf("scan workflow step: %w", err)
		}
		workflow.Steps = append(workflow.Steps, step)
	}
	if err := rows.Err(); err != nil {
		return Workflow{}, fmt.Errorf("iterate workflow steps: %w", err)
	}
	return workflow, nil
}

func (repository *PostgresRepository) MarkWorkflowRunning(ctx context.Context, workflowID string) error {
	command, err := repository.pool.Exec(ctx, `
		UPDATE agent_workflow
		SET started_at = COALESCE(started_at, now()), status = 'running', updated_at = now()
		WHERE id = $1 AND status IN ('preview', 'queued', 'running')
	`, workflowID)
	if err != nil {
		return fmt.Errorf("mark workflow running: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrWorkflowNotFound
	}
	return nil
}

func (repository *PostgresRepository) MarkWorkflowQueued(ctx context.Context, workflowID string) error {
	command, err := repository.pool.Exec(ctx, `
		UPDATE agent_workflow
		SET status = 'queued', updated_at = now()
		WHERE id = $1 AND status = 'preview'
	`, workflowID)
	if err != nil {
		return fmt.Errorf("mark workflow queued: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrWorkflowNotFound
	}
	return nil
}

func (repository *PostgresRepository) MarkStepRunning(ctx context.Context, stepID string) error {
	command, err := repository.pool.Exec(ctx, `
		UPDATE agent_workflow_step
		SET attempt_count = attempt_count + 1, error_code = NULL,
		    started_at = now(), status = 'running', updated_at = now()
		WHERE id = $1 AND status IN ('pending', 'running', 'failed')
	`, stepID)
	if err != nil {
		return fmt.Errorf("mark workflow step running: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrWorkflowNotFound
	}
	return nil
}

func (repository *PostgresRepository) MarkStepCompleted(
	ctx context.Context,
	step WorkflowStep,
	succeeded bool,
) error {
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin step completion transaction: %w", err)
	}
	defer transaction.Rollback(ctx)
	_, err = transaction.Exec(ctx, `
		UPDATE agent_workflow_step
		SET completed_at = now(), error_code = $1, output = $2, status = $3, updated_at = now()
		WHERE id = $4
	`, step.ErrorCode, step.Output, step.Status, step.ID)
	if err != nil {
		return fmt.Errorf("complete workflow step: %w", err)
	}
	_, err = transaction.Exec(ctx, `
		INSERT INTO agent_dispatch_stat (agent_id, execution_count, success_count)
		VALUES ($1, 1, $2)
		ON CONFLICT (agent_id) DO UPDATE SET
			execution_count = agent_dispatch_stat.execution_count + 1,
			success_count = agent_dispatch_stat.success_count + EXCLUDED.success_count,
			updated_at = now()
	`, step.AgentID, boolToInt(succeeded))
	if err != nil {
		return fmt.Errorf("update execution stats: %w", err)
	}
	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("commit step completion transaction: %w", err)
	}
	return nil
}

func (repository *PostgresRepository) CompleteWorkflow(ctx context.Context, workflowID, status string) error {
	return updateWorkflowStatus(ctx, repository.pool, workflowID, status, true)
}

func updateWorkflowStatus(
	ctx context.Context,
	pool *pgxpool.Pool,
	workflowID string,
	status string,
	completed bool,
) error {
	command, err := pool.Exec(ctx, `
		UPDATE agent_workflow
		SET completed_at = CASE WHEN $3 THEN now() ELSE completed_at END,
		    status = $1, updated_at = now()
		WHERE id = $2
	`, status, workflowID, completed)
	if err != nil {
		return fmt.Errorf("update workflow status: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrWorkflowNotFound
	}
	return nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
