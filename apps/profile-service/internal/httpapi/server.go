package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/junbozhou88/aws-demo-001/profile-service/internal/agent"
	"github.com/junbozhou88/aws-demo-001/profile-service/internal/profile"
)

const maxTaskRequestBytes = 45_000

type Server struct {
	allowedOrigin string
	agents        *agent.Service
	logger        *slog.Logger
	profiles      *profile.Service
}

func NewServer(profiles *profile.Service, agents *agent.Service, allowedOrigin string, logger *slog.Logger) http.Handler {
	server := &Server{agents: agents, allowedOrigin: allowedOrigin, logger: logger, profiles: profiles}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /v1/agents", server.listAgents)
	mux.HandleFunc("POST /v1/tasks", server.createTask)
	mux.HandleFunc("GET /v1/tasks/{taskId}", server.getTask)
	mux.HandleFunc("GET /v1/profiles/{profileId}/introduction", server.getIntroduction)
	mux.HandleFunc("POST /v1/profiles/{profileId}/introduction", server.generateIntroduction)
	return server.withMiddleware(mux)
}

func (server *Server) listAgents(writer http.ResponseWriter, request *http.Request) {
	result, err := server.agents.ListAgents(request.Context())
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"agents": result})
}

func (server *Server) createTask(writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, maxTaskRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input agent.CreateTaskInput
	if err := decoder.Decode(&input); err != nil {
		status := http.StatusBadRequest
		if errors.As(err, new(*http.MaxBytesError)) {
			status = http.StatusRequestEntityTooLarge
		}
		writeError(writer, status, "任务参数无效")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(writer, http.StatusBadRequest, "请求只能包含一个 JSON 对象")
		return
	}

	result, err := server.agents.CreateTask(request.Context(), input)
	if err == nil {
		writeJSON(writer, http.StatusCreated, result)
		return
	}
	switch {
	case errors.Is(err, agent.ErrInvalidTask):
		writeError(writer, http.StatusBadRequest, "任务描述至少需要 10 个字符")
	case errors.Is(err, agent.ErrNoAgents):
		writeError(writer, http.StatusServiceUnavailable, "当前没有可用 Agent")
	default:
		server.internalError(writer, request, err)
	}
}

func (server *Server) getTask(writer http.ResponseWriter, request *http.Request) {
	result, err := server.agents.GetTask(request.Context(), request.PathValue("taskId"))
	if err == nil {
		writeJSON(writer, http.StatusOK, result)
		return
	}
	if errors.Is(err, agent.ErrTaskNotFound) {
		writeError(writer, http.StatusNotFound, "任务不存在")
		return
	}
	server.internalError(writer, request, err)
}

func (server *Server) health(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Server) generateIntroduction(writer http.ResponseWriter, request *http.Request) {
	result, err := server.profiles.GenerateIntroduction(request.Context(), request.PathValue("profileId"))
	if err == nil {
		writeJSON(writer, http.StatusOK, result)
		return
	}

	switch {
	case errors.Is(err, profile.ErrInvalidProfileID):
		writeError(writer, http.StatusBadRequest, "名片 ID 格式无效")
	case errors.Is(err, profile.ErrNotFound):
		writeError(writer, http.StatusNotFound, "名片不存在")
	default:
		server.internalError(writer, request, err)
	}
}

func (server *Server) getIntroduction(writer http.ResponseWriter, request *http.Request) {
	result, err := server.profiles.GetIntroduction(request.Context(), request.PathValue("profileId"))
	if err == nil {
		writeJSON(writer, http.StatusOK, result)
		return
	}

	switch {
	case errors.Is(err, profile.ErrInvalidProfileID):
		writeError(writer, http.StatusBadRequest, "名片 ID 格式无效")
	case errors.Is(err, profile.ErrIntroductionNotFound):
		writeError(writer, http.StatusNotFound, "简介不存在")
	default:
		server.internalError(writer, request, err)
	}
}

func (server *Server) internalError(writer http.ResponseWriter, request *http.Request, err error) {
	server.logger.Error("request failed", "error", err, "method", request.Method, "path", request.URL.Path)
	writeError(writer, http.StatusInternalServerError, "服务暂时不可用")
}

func (server *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		startedAt := time.Now()
		writer.Header().Set("Access-Control-Allow-Origin", server.allowedOrigin)
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		writer.Header().Set("Vary", "Origin")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(writer, request)
		server.logger.Info("request completed", "durationMs", time.Since(startedAt).Milliseconds(), "method", request.Method, "path", request.URL.Path)
	})
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		slog.Error("encode response", "error", err)
	}
}
