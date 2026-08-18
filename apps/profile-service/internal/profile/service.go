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
