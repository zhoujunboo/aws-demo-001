package agent

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrTaskNotFound = errors.New("agent task not found")

type Repository interface {
	CompleteTask(context.Context, string, string) error
	CreateTask(context.Context, Task) error
	GetTask(context.Context, string) (Task, error)
	ListAgents(context.Context) ([]Agent, error)
	UpdateExecution(context.Context, Execution) error
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) ListAgents(ctx context.Context) ([]Agent, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT capabilities, created_at, description, endpoint_url, id, name, status, updated_at
		FROM agent
		WHERE status = 'active'
		ORDER BY id
	`)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	agents := make([]Agent, 0)
	for rows.Next() {
		var storedAgent Agent
		if err := rows.Scan(
			&storedAgent.Capabilities, &storedAgent.CreatedAt, &storedAgent.Description,
			&storedAgent.EndpointURL, &storedAgent.ID, &storedAgent.Name,
			&storedAgent.Status, &storedAgent.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		agents = append(agents, storedAgent)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agents: %w", err)
	}
	return agents, nil
}

func (repository *PostgresRepository) CreateTask(ctx context.Context, task Task) error {
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin task transaction: %w", err)
	}
	defer transaction.Rollback(ctx)

	_, err = transaction.Exec(ctx, `
		INSERT INTO agent_task (created_at, description, id, resume, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, task.CreatedAt, task.Description, task.ID, task.Resume, task.Status, task.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create task: %w", err)
	}

	for _, execution := range task.Executions {
		_, err = transaction.Exec(ctx, `
			INSERT INTO agent_execution (agent_id, created_at, id, rank, score, status, task_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, execution.AgentID, execution.CreatedAt, execution.ID, execution.Rank, execution.Score, execution.Status, execution.TaskID)
		if err != nil {
			return fmt.Errorf("create execution: %w", err)
		}
	}

	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("commit task: %w", err)
	}
	return nil
}

func (repository *PostgresRepository) UpdateExecution(ctx context.Context, execution Execution) error {
	command, err := repository.pool.Exec(ctx, `
		UPDATE agent_execution
		SET completed_at = $1, duration_ms = $2, error_code = $3, output = $4, status = $5
		WHERE id = $6
	`, execution.CompletedAt, execution.DurationMS, execution.ErrorCode, execution.Output, execution.Status, execution.ID)
	if err != nil {
		return fmt.Errorf("update execution: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrTaskNotFound
	}
	return nil
}

func (repository *PostgresRepository) CompleteTask(ctx context.Context, taskID, status string) error {
	command, err := repository.pool.Exec(ctx, `
		UPDATE agent_task
		SET completed_at = now(), status = $1, updated_at = now()
		WHERE id = $2
	`, status, taskID)
	if err != nil {
		return fmt.Errorf("complete task: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrTaskNotFound
	}
	return nil
}

func (repository *PostgresRepository) GetTask(ctx context.Context, taskID string) (Task, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT completed_at, created_at, description, id, resume, status, updated_at
		FROM agent_task
		WHERE id = $1
	`, taskID)

	var task Task
	if err := row.Scan(
		&task.CompletedAt, &task.CreatedAt, &task.Description, &task.ID,
		&task.Resume, &task.Status, &task.UpdatedAt,
	); errors.Is(err, pgx.ErrNoRows) {
		return Task{}, ErrTaskNotFound
	} else if err != nil {
		return Task{}, fmt.Errorf("get task: %w", err)
	}

	rows, err := repository.pool.Query(ctx, `
		SELECT execution.agent_id, agent.name, execution.completed_at, execution.created_at,
		       execution.duration_ms, execution.error_code, execution.id, execution.output,
		       execution.rank, execution.score, execution.status, execution.task_id
		FROM agent_execution AS execution
		JOIN agent ON agent.id = execution.agent_id
		WHERE execution.task_id = $1
		ORDER BY execution.rank
	`, taskID)
	if err != nil {
		return Task{}, fmt.Errorf("list task executions: %w", err)
	}
	defer rows.Close()

	task.Executions = make([]Execution, 0)
	for rows.Next() {
		var execution Execution
		if err := rows.Scan(
			&execution.AgentID, &execution.AgentName, &execution.CompletedAt,
			&execution.CreatedAt, &execution.DurationMS, &execution.ErrorCode,
			&execution.ID, &execution.Output, &execution.Rank, &execution.Score,
			&execution.Status, &execution.TaskID,
		); err != nil {
			return Task{}, fmt.Errorf("scan task execution: %w", err)
		}
		task.Executions = append(task.Executions, execution)
	}
	if err := rows.Err(); err != nil {
		return Task{}, fmt.Errorf("iterate task executions: %w", err)
	}
	return task, nil
}
