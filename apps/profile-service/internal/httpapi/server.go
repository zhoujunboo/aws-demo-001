package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/junbozhou88/aws-demo-001/profile-service/internal/profile"
)

type Server struct {
	allowedOrigin string
	logger        *slog.Logger
	profiles      *profile.Service
}

func NewServer(profiles *profile.Service, allowedOrigin string, logger *slog.Logger) http.Handler {
	server := &Server{allowedOrigin: allowedOrigin, logger: logger, profiles: profiles}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /v1/profiles", server.listProfiles)
	mux.HandleFunc("POST /v1/profiles/{username}/introduction", server.generateIntroduction)
	mux.HandleFunc("DELETE /v1/profiles/{id}", server.deleteProfile)
	return server.withMiddleware(mux)
}

func (server *Server) health(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Server) listProfiles(writer http.ResponseWriter, request *http.Request) {
	profiles, err := server.profiles.List(request.Context())
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, profiles)
}

func (server *Server) generateIntroduction(writer http.ResponseWriter, request *http.Request) {
	result, err := server.profiles.GenerateIntroduction(request.Context(), request.PathValue("username"))
	if err == nil {
		writeJSON(writer, http.StatusOK, result)
		return
	}

	switch {
	case errors.Is(err, profile.ErrGitHubNotFound):
		writeError(writer, http.StatusNotFound, "GitHub 用户不存在")
	case errors.Is(err, profile.ErrGitHubRateLimit):
		writeError(writer, http.StatusTooManyRequests, "GitHub API 请求频率已达上限，请稍后再试")
	case errors.Is(err, profile.ErrGitHubUnexpected):
		writeError(writer, http.StatusBadGateway, "GitHub 返回了无法识别的数据")
	case err.Error() == "username must be a valid GitHub username":
		writeError(writer, http.StatusBadRequest, "请输入有效的 GitHub 用户名")
	default:
		server.internalError(writer, request, err)
	}
}

func (server *Server) deleteProfile(writer http.ResponseWriter, request *http.Request) {
	id := request.PathValue("id")
	err := server.profiles.Delete(request.Context(), id)
	if errors.Is(err, profile.ErrNotFound) {
		writeError(writer, http.StatusNotFound, "名片不存在")
		return
	}
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"id": id})
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
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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
