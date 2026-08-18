package profile

import (
	"context"
	"crypto/rand"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$`)

type Service struct {
	github     GitHubClient
	now        func() time.Time
	repository Repository
}

func NewService(repository Repository, github GitHubClient) *Service {
	return &Service{
		github:     github,
		now:        time.Now,
		repository: repository,
	}
}

func (service *Service) List(ctx context.Context) ([]Profile, error) {
	return service.repository.List(ctx)
}

func (service *Service) Delete(ctx context.Context, id string) error {
	if !isUUID(id) {
		return ErrNotFound
	}
	return service.repository.Delete(ctx, id)
}

func (service *Service) GenerateIntroduction(ctx context.Context, username string) (Introduction, error) {
	normalizedUsername := strings.TrimSpace(username)
	if !usernamePattern.MatchString(normalizedUsername) {
		return Introduction{}, fmt.Errorf("username must be a valid GitHub username")
	}

	githubProfile, err := service.github.GetUser(ctx, normalizedUsername)
	if err != nil {
		return Introduction{}, err
	}

	now := service.now().UTC()
	profile := Profile{
		AvatarURL:       githubProfile.AvatarURL,
		Bio:             githubProfile.Bio,
		Followers:       githubProfile.Followers,
		Following:       githubProfile.Following,
		GitHubCreatedAt: githubProfile.GitHubCreatedAt,
		GitHubID:        githubProfile.GitHubID,
		ID:              newUUID(),
		Location:        githubProfile.Location,
		Login:           githubProfile.Login,
		Name:            githubProfile.Name,
		ProfileURL:      githubProfile.ProfileURL,
		PublicRepos:     githubProfile.PublicRepos,
		UpdatedAt:       now,
	}

	savedProfile, err := service.repository.Save(ctx, profile)
	if err != nil {
		return Introduction{}, err
	}
	return Introduction{
		Introduction: buildIntroduction(savedProfile),
		Profile:      savedProfile,
	}, nil
}

func buildIntroduction(profile Profile) string {
	displayName := profile.Login
	if profile.Name != nil && strings.TrimSpace(*profile.Name) != "" {
		displayName = strings.TrimSpace(*profile.Name)
	}

	parts := []string{fmt.Sprintf("我是 %s（@%s）", displayName, profile.Login)}
	if profile.Location != nil && strings.TrimSpace(*profile.Location) != "" {
		parts = append(parts, "来自 "+strings.TrimSpace(*profile.Location))
	}
	parts = append(parts, fmt.Sprintf("目前在 GitHub 维护 %d 个公开仓库，并有 %d 位关注者", profile.PublicRepos, profile.Followers))
	if profile.Bio != nil && strings.TrimSpace(*profile.Bio) != "" {
		parts = append(parts, "个人简介是：“"+strings.TrimSpace(*profile.Bio)+"”")
	}
	return strings.Join(parts, "。") + "。"
}

func newUUID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Sprintf("generate UUID: %v", err))
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}

func isUUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if character != '-' {
				return false
			}
			continue
		}
		if !((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f') || (character >= 'A' && character <= 'F')) {
			return false
		}
	}
	return true
}
