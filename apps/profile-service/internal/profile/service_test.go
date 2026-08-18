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
		Bio:         &bio,
		Followers:   42,
		ID:          testProfileID,
		Location:    &location,
		Login:       "codex",
		Name:        &name,
		PublicRepos: 12,
	}}
	service := NewService(repository)
	service.now = func() time.Time { return time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC) }

	result, err := service.GenerateIntroduction(context.Background(), testProfileID)
	if err != nil {
		t.Fatalf("GenerateIntroduction returned an error: %v", err)
	}

	expected := "我是 Codex（@codex）。来自 Cloud。目前在 GitHub 维护 12 个公开仓库，并有 42 位关注者。个人简介是：“Builds reliable software”。"
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
