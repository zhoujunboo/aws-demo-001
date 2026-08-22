package agent

import "time"

type Agent struct {
	Capabilities []string  `json:"capabilities"`
	CreatedAt    time.Time `json:"createdAt"`
	Description  string    `json:"description"`
	EndpointURL  string    `json:"-"`
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type CreateTaskInput struct {
	Description string  `json:"description"`
	Resume      *string `json:"resume,omitempty"`
}

type RegisterAgentInput struct {
	Capabilities []string `json:"capabilities"`
	Description  string   `json:"description"`
	EndpointURL  string   `json:"endpointUrl"`
	ID           string   `json:"id"`
	Name         string   `json:"name"`
}

type Task struct {
	CompletedAt *time.Time  `json:"completedAt"`
	CreatedAt   time.Time   `json:"createdAt"`
	Description string      `json:"description"`
	Executions  []Execution `json:"executions"`
	ID          string      `json:"id"`
	Resume      *string     `json:"resume,omitempty"`
	Status      string      `json:"status"`
	UpdatedAt   time.Time   `json:"updatedAt"`
}

type Execution struct {
	AgentID     string     `json:"agentId"`
	AgentName   string     `json:"agentName"`
	CompletedAt *time.Time `json:"completedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	DurationMS  *int       `json:"durationMs"`
	ErrorCode   *string    `json:"errorCode,omitempty"`
	ID          string     `json:"id"`
	Output      *string    `json:"output,omitempty"`
	Rank        int        `json:"rank"`
	Score       int        `json:"score"`
	Status      string     `json:"status"`
	TaskID      string     `json:"taskId"`
}

type Match struct {
	Agent Agent
	Rank  int
	Score int
}

type AgentEmbedding struct {
	AgentID     string
	ContentHash string
	Embedding   []float64
	Model       string
	SourceText  string
}

type EmbeddingMetadata struct {
	ContentHash string
	Model       string
}

type VectorCandidate struct {
	Agent      Agent
	Similarity float64
}
