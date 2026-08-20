package profile

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrInvalidProfileID = errors.New("profile ID must be a UUID")

type Service struct {
	now        func() time.Time
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{
		now:        time.Now,
		repository: repository,
	}
}

func (service *Service) GenerateIntroduction(ctx context.Context, profileID string) (Introduction, error) {
	if !isUUID(profileID) {
		return Introduction{}, ErrInvalidProfileID
	}

	storedProfile, err := service.repository.GetProfile(ctx, profileID)
	if err != nil {
		return Introduction{}, err
	}

	now := service.now().UTC()
	introduction := Introduction{
		Content:   buildIntroduction(storedProfile),
		ID:        newUUID(),
		ProfileID: storedProfile.ID,
		UpdatedAt: now,
	}

	return service.repository.SaveIntroduction(ctx, introduction)
}

func (service *Service) GetIntroduction(ctx context.Context, profileID string) (Introduction, error) {
	if !isUUID(profileID) {
		return Introduction{}, ErrInvalidProfileID
	}
	return service.repository.GetIntroduction(ctx, profileID)
}

func buildIntroduction(profile Profile) string {
	displayName := profile.Login
	if profile.Name != nil && strings.TrimSpace(*profile.Name) != "" {
		displayName = strings.TrimSpace(*profile.Name)
	}

	var parts []string
	if profile.Location != nil && strings.TrimSpace(*profile.Location) != "" {
		parts = append(parts, fmt.Sprintf("你好，我是 %s（@%s），来自 %s", displayName, profile.Login, strings.TrimSpace(*profile.Location)))
	} else {
		parts = append(parts, fmt.Sprintf("你好，我是 %s（@%s）", displayName, profile.Login))
	}

	if !profile.GitHubCreatedAt.IsZero() {
		parts = append(parts, fmt.Sprintf("自 %d 年加入 GitHub 社区以来，始终保持对开源与技术创新的热情", profile.GitHubCreatedAt.Year()))
	}

	if profile.Following > 0 {
		parts = append(parts, fmt.Sprintf("目前在平台维护了 %d 个公开仓库，收获了 %d 位同行的关注，同时也关注了 %d 位优秀的开发者", profile.PublicRepos, profile.Followers, profile.Following))
	} else {
		parts = append(parts, fmt.Sprintf("目前在平台维护了 %d 个公开仓库，拥有 %d 位关注者", profile.PublicRepos, profile.Followers))
	}

	if profile.Bio != nil && strings.TrimSpace(*profile.Bio) != "" {
		parts = append(parts, fmt.Sprintf("个人简介是：“%s”", strings.TrimSpace(*profile.Bio)))
	}

	parts = append(parts, "热衷于探索前沿技术与工程实践，持续构建高质量的软件项目，期待与大家交流合作、共同成长")

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
