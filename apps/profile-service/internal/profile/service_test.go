package profile

import (
	"context"
	"testing"
	"time"
)

const testProfileID = "53b361fc-d7ee-42c8-8815-901199141580"

type memoryRepository struct {
	introduction Introduction
	profile      Profile
}

func (repository *memoryRepository) GetIntroduction(_ context.Context, profileID string) (Introduction, error) {
	if repository.introduction.ProfileID != profileID {
		return Introduction{}, ErrIntroductionNotFound
	}
	return repository.introduction, nil
}

func (repository *memoryRepository) GetProfile(_ context.Context, profileID string) (Profile, error) {
	if repository.profile.ID != profileID {
		return Profile{}, ErrNotFound
	}
	return repository.profile, nil
}

func (repository *memoryRepository) SaveIntroduction(_ context.Context, introduction Introduction) (Introduction, error) {
	if repository.introduction.ID != "" {
		introduction.CreatedAt = repository.introduction.CreatedAt
		introduction.ID = repository.introduction.ID
	} else {
		introduction.CreatedAt = introduction.UpdatedAt
	}
	repository.introduction = introduction
	return introduction, nil
}

func TestGenerateIntroduction(t *testing.T) {
	name := "Codex"
	location := "Cloud"
	bio := "Builds reliable software"
	repository := &memoryRepository{profile: Profile{
		Bio:             &bio,
		Followers:       42,
		Following:       8,
		GitHubCreatedAt: time.Date(2021, time.January, 1, 0, 0, 0, 0, time.UTC),
		ID:              testProfileID,
		Location:        &location,
		Login:           "codex",
		Name:            &name,
		PublicRepos:     12,
	}}
	service := NewService(repository)
	service.now = func() time.Time { return time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC) }

	result, err := service.GenerateIntroduction(context.Background(), testProfileID)
	if err != nil {
		t.Fatalf("GenerateIntroduction returned an error: %v", err)
	}

	expected := "你好，我是 Codex（@codex），来自 Cloud。自 2021 年加入 GitHub 社区以来，始终保持对开源与技术创新的热情。目前在平台维护了 12 个公开仓库，收获了 42 位同行的关注，同时也关注了 8 位优秀的开发者。个人简介是：“Builds reliable software”。热衷于探索前沿技术与工程实践，持续构建高质量的软件项目，期待与大家交流合作、共同成长。"
	if result.Content != expected {
		t.Fatalf("unexpected introduction: %q", result.Content)
	}
	if result.ProfileID != testProfileID {
		t.Fatalf("unexpected profile ID: %q", result.ProfileID)
	}
	if repository.introduction.Content != expected {
		t.Fatal("introduction was not saved")
	}
}

func TestGenerateIntroductionMinimalProfile(t *testing.T) {
	repository := &memoryRepository{profile: Profile{
		Followers:   0,
		Following:   0,
		ID:          testProfileID,
		Login:       "developer",
		PublicRepos: 3,
	}}
	service := NewService(repository)
	service.now = func() time.Time { return time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC) }

	result, err := service.GenerateIntroduction(context.Background(), testProfileID)
	if err != nil {
		t.Fatalf("GenerateIntroduction returned an error: %v", err)
	}

	expected := "你好，我是 developer（@developer）。目前在平台维护了 3 个公开仓库，拥有 0 位关注者。热衷于探索前沿技术与工程实践，持续构建高质量的软件项目，期待与大家交流合作、共同成长。"
	if result.Content != expected {
		t.Fatalf("unexpected introduction: %q", result.Content)
	}
}

func TestGenerateIntroductionRejectsInvalidProfileID(t *testing.T) {
	service := NewService(&memoryRepository{})
	if _, err := service.GenerateIntroduction(context.Background(), "not-a-uuid"); err != ErrInvalidProfileID {
		t.Fatalf("expected ErrInvalidProfileID, got %v", err)
	}
}

func TestGenerateIntroductionReturnsNotFound(t *testing.T) {
	service := NewService(&memoryRepository{})
	if _, err := service.GenerateIntroduction(context.Background(), testProfileID); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
