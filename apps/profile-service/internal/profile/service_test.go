package profile

import (
	"context"
	"testing"
	"time"
)

type memoryRepository struct {
	profile Profile
}

func (repository *memoryRepository) Delete(_ context.Context, _ string) error { return nil }

func (repository *memoryRepository) List(_ context.Context) ([]Profile, error) {
	return []Profile{repository.profile}, nil
}

func (repository *memoryRepository) Save(_ context.Context, profile Profile) (Profile, error) {
	profile.CreatedAt = profile.UpdatedAt
	repository.profile = profile
	return profile, nil
}

type staticGitHubClient struct {
	profile GitHubProfile
}

func (client staticGitHubClient) GetUser(_ context.Context, _ string) (GitHubProfile, error) {
	return client.profile, nil
}

func TestGenerateIntroduction(t *testing.T) {
	name := "Codex"
	location := "Cloud"
	bio := "Builds reliable software"
	repository := &memoryRepository{}
	service := NewService(repository, staticGitHubClient{profile: GitHubProfile{
		AvatarURL:       "https://example.com/avatar.png",
		Bio:             &bio,
		Followers:       42,
		Following:       7,
		GitHubCreatedAt: time.Date(2020, time.January, 2, 0, 0, 0, 0, time.UTC),
		GitHubID:        123,
		Location:        &location,
		Login:           "codex",
		Name:            &name,
		ProfileURL:      "https://github.com/codex",
		PublicRepos:     12,
	}})
	service.now = func() time.Time { return time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC) }

	result, err := service.GenerateIntroduction(context.Background(), "codex")
	if err != nil {
		t.Fatalf("GenerateIntroduction returned an error: %v", err)
	}

	expected := "我是 Codex（@codex）。来自 Cloud。目前在 GitHub 维护 12 个公开仓库，并有 42 位关注者。个人简介是：“Builds reliable software”。"
	if result.Introduction != expected {
		t.Fatalf("unexpected introduction: %q", result.Introduction)
	}
	if result.Profile.Login != "codex" {
		t.Fatalf("unexpected saved login: %q", result.Profile.Login)
	}
}

func TestGenerateIntroductionRejectsInvalidUsername(t *testing.T) {
	service := NewService(&memoryRepository{}, staticGitHubClient{})
	if _, err := service.GenerateIntroduction(context.Background(), "invalid user"); err == nil {
		t.Fatal("expected invalid username error")
	}
}
