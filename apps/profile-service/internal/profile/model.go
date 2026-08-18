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
	Introduction string  `json:"introduction"`
	Profile      Profile `json:"profile"`
}

type GitHubProfile struct {
	AvatarURL       string    `json:"avatar_url"`
	Bio             *string   `json:"bio"`
	Followers       int       `json:"followers"`
	Following       int       `json:"following"`
	GitHubCreatedAt time.Time `json:"created_at"`
	GitHubID        int64     `json:"id"`
	Location        *string   `json:"location"`
	Login           string    `json:"login"`
	Name            *string   `json:"name"`
	ProfileURL      string    `json:"html_url"`
	PublicRepos     int       `json:"public_repos"`
}
