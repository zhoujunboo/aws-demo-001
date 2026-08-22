package agent

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAgentConflict = errors.New("agent id or endpoint already exists")
	ErrTaskNotFound  = errors.New("agent task not found")
)

type Repository interface {
	CompleteTask(context.Context, string, string) error
	CreateAgentWithEmbedding(context.Context, Agent, AgentEmbedding) error
	CreateTask(context.Context, Task) error
	GetTask(context.Context, string) (Task, error)
	ListAgentEmbeddingMetadata(context.Context) (map[string]EmbeddingMetadata, error)
	ListAgents(context.Context) ([]Agent, error)
	SearchAgentsByEmbedding(context.Context, string, []float64, int) ([]VectorCandidate, error)
	UpdateExecution(context.Context, Execution) error
	UpsertAgentEmbeddings(context.Context, []AgentEmbedding) error
}

func (repository *PostgresRepository) CreateAgentWithEmbedding(
	ctx context.Context,
	registeredAgent Agent,
	embedding AgentEmbedding,
) error {
	vector, err := vectorLiteral(embedding.Embedding)
	if err != nil {
		return err
	}
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin agent registration transaction: %w", err)
	}
	defer transaction.Rollback(ctx)

	_, err = transaction.Exec(ctx, `
		INSERT INTO agent (
			capabilities, created_at, description, endpoint_url, id, name, status, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, registeredAgent.Capabilities, registeredAgent.CreatedAt, registeredAgent.Description,
		registeredAgent.EndpointURL, registeredAgent.ID, registeredAgent.Name,
		registeredAgent.Status, registeredAgent.UpdatedAt)
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return ErrAgentConflict
		}
		return fmt.Errorf("create agent: %w", err)
	}

	_, err = transaction.Exec(ctx, `
		INSERT INTO agent_embedding (
			agent_id, content_hash, embedding, embedding_model, source_text
		)
		VALUES ($1, $2, $3::vector, $4, $5)
	`, embedding.AgentID, embedding.ContentHash, vector, embedding.Model, embedding.SourceText)
	if err != nil {
		return fmt.Errorf("create agent embedding: %w", err)
	}

	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("commit agent registration transaction: %w", err)
	}
	return nil
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

func (repository *PostgresRepository) ListAgentEmbeddingMetadata(ctx context.Context) (map[string]EmbeddingMetadata, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT agent_id, content_hash, embedding_model
		FROM agent_embedding
	`)
	if err != nil {
		return nil, fmt.Errorf("list agent embedding metadata: %w", err)
	}
	defer rows.Close()

	metadata := make(map[string]EmbeddingMetadata)
	for rows.Next() {
		var agentID string
		var item EmbeddingMetadata
		if err := rows.Scan(&agentID, &item.ContentHash, &item.Model); err != nil {
			return nil, fmt.Errorf("scan agent embedding metadata: %w", err)
		}
		metadata[agentID] = item
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agent embedding metadata: %w", err)
	}
	return metadata, nil
}

func (repository *PostgresRepository) UpsertAgentEmbeddings(ctx context.Context, embeddings []AgentEmbedding) error {
	if len(embeddings) == 0 {
		return nil
	}
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin agent embedding transaction: %w", err)
	}
	defer transaction.Rollback(ctx)

	for _, embedding := range embeddings {
		vector, vectorErr := vectorLiteral(embedding.Embedding)
		if vectorErr != nil {
			return vectorErr
		}
		_, err = transaction.Exec(ctx, `
			INSERT INTO agent_embedding (
				agent_id, content_hash, embedding, embedding_model, source_text
			)
			VALUES ($1, $2, $3::vector, $4, $5)
			ON CONFLICT (agent_id) DO UPDATE SET
				content_hash = EXCLUDED.content_hash,
				embedding = EXCLUDED.embedding,
				embedding_model = EXCLUDED.embedding_model,
				source_text = EXCLUDED.source_text,
				updated_at = now()
		`, embedding.AgentID, embedding.ContentHash, vector, embedding.Model, embedding.SourceText)
		if err != nil {
			return fmt.Errorf("upsert agent embedding: %w", err)
		}
	}

	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("commit agent embedding transaction: %w", err)
	}
	return nil
}

func (repository *PostgresRepository) SearchAgentsByEmbedding(
	ctx context.Context,
	model string,
	embedding []float64,
	limit int,
) ([]VectorCandidate, error) {
	vector, err := vectorLiteral(embedding)
	if err != nil {
		return nil, err
	}
	rows, err := repository.pool.Query(ctx, `
		SELECT agent.capabilities, agent.created_at, agent.description, agent.endpoint_url,
		       agent.id, agent.name, agent.status, agent.updated_at,
		       1 - (agent_embedding.embedding <=> $1::vector) AS similarity
		FROM agent_embedding
		JOIN agent ON agent.id = agent_embedding.agent_id
		WHERE agent.status = 'active'
		  AND agent_embedding.embedding_model = $2
		  AND vector_dims(agent_embedding.embedding) = vector_dims($1::vector)
		ORDER BY agent_embedding.embedding <=> $1::vector, agent.id
		LIMIT $3
	`, vector, model, limit)
	if err != nil {
		return nil, fmt.Errorf("search agents by embedding: %w", err)
	}
	defer rows.Close()

	candidates := make([]VectorCandidate, 0, limit)
	for rows.Next() {
		var candidate VectorCandidate
		if err := rows.Scan(
			&candidate.Agent.Capabilities, &candidate.Agent.CreatedAt,
			&candidate.Agent.Description, &candidate.Agent.EndpointURL,
			&candidate.Agent.ID, &candidate.Agent.Name, &candidate.Agent.Status,
			&candidate.Agent.UpdatedAt, &candidate.Similarity,
		); err != nil {
			return nil, fmt.Errorf("scan vector candidate: %w", err)
		}
		candidates = append(candidates, candidate)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate vector candidates: %w", err)
	}
	return candidates, nil
}

func vectorLiteral(values []float64) (string, error) {
	if len(values) == 0 {
		return "", errors.New("embedding must not be empty")
	}
	parts := make([]string, len(values))
	for index, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return "", errors.New("embedding contains a non-finite value")
		}
		parts[index] = strconv.FormatFloat(value, 'g', -1, 64)
	}
	return "[" + strings.Join(parts, ",") + "]", nil
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
