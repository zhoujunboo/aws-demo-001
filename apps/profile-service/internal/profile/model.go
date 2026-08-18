package profile

import "time"

type Profile struct {
	AvatarURL       string    `json:"avatarUrl"`
	Bio             *string   `json:"bio"`
	CreatedAt       time.Time `json:"createdAt"`
	Followers       int       `json:"followers"`
	Following       int       `json:"following"`
	GitHubCreatedAt time.Time `json:"githubCreatedAt"`
	GitHubID        int64     `json:"githubId"`
	ID              string    `json:"id"`
	Location        *string   `json:"location"`
	Login           string    `json:"login"`
	Name            *string   `json:"name"`
	ProfileURL      string    `json:"profileUrl"`
	PublicRepos     int       `json:"publicRepos"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type Introduction struct {
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	ID        string    `json:"id"`
	ProfileID string    `json:"profileId"`
	UpdatedAt time.Time `json:"updatedAt"`
}
