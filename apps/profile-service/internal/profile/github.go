package profile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

var (
	ErrGitHubNotFound   = errors.New("GitHub user not found")
	ErrGitHubRateLimit  = errors.New("GitHub API rate limit reached")
	ErrGitHubUnexpected = errors.New("GitHub returned an unexpected response")
)

type GitHubClient interface {
	GetUser(context.Context, string) (GitHubProfile, error)
}

type HTTPGitHubClient struct {
	client *http.Client
	token  string
}

func NewHTTPGitHubClient(client *http.Client, token string) *HTTPGitHubClient {
	return &HTTPGitHubClient{client: client, token: token}
}

func (client *HTTPGitHubClient) GetUser(ctx context.Context, username string) (GitHubProfile, error) {
	endpoint := "https://api.github.com/users/" + url.PathEscape(username)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return GitHubProfile{}, fmt.Errorf("create GitHub request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "aws-demo-001-profile-service")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if client.token != "" {
		request.Header.Set("Authorization", "Bearer "+client.token)
	}

	response, err := client.client.Do(request)
	if err != nil {
		return GitHubProfile{}, fmt.Errorf("request GitHub user: %w", err)
	}
	defer response.Body.Close()

	switch response.StatusCode {
	case http.StatusNotFound:
		return GitHubProfile{}, ErrGitHubNotFound
	case http.StatusForbidden, http.StatusTooManyRequests:
		return GitHubProfile{}, ErrGitHubRateLimit
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return GitHubProfile{}, fmt.Errorf("%w: status %d", ErrGitHubUnexpected, response.StatusCode)
	}

	var result GitHubProfile
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return GitHubProfile{}, fmt.Errorf("decode GitHub user: %w", err)
	}
	if result.GitHubID <= 0 || result.Login == "" || result.AvatarURL == "" || result.ProfileURL == "" {
		return GitHubProfile{}, ErrGitHubUnexpected
	}
	return result, nil
}
