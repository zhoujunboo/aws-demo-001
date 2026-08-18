package profile

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrIntroductionNotFound = errors.New("introduction not found")
	ErrNotFound             = errors.New("profile not found")
)

type Repository interface {
	GetIntroduction(context.Context, string) (Introduction, error)
	GetProfile(context.Context, string) (Profile, error)
	SaveIntroduction(context.Context, Introduction) (Introduction, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) GetProfile(ctx context.Context, id string) (Profile, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT avatar_url, bio, created_at, followers, following, github_created_at,
		       github_id, id, location, login, name, profile_url, public_repos, updated_at
		FROM github_profile
		WHERE id = $1
	`, id)

	var storedProfile Profile
	err := row.Scan(
		&storedProfile.AvatarURL, &storedProfile.Bio, &storedProfile.CreatedAt,
		&storedProfile.Followers, &storedProfile.Following, &storedProfile.GitHubCreatedAt,
		&storedProfile.GitHubID, &storedProfile.ID, &storedProfile.Location,
		&storedProfile.Login, &storedProfile.Name, &storedProfile.ProfileURL,
		&storedProfile.PublicRepos, &storedProfile.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	if err != nil {
		return Profile{}, fmt.Errorf("get profile: %w", err)
	}
	return storedProfile, nil
}

func (repository *PostgresRepository) GetIntroduction(ctx context.Context, profileID string) (Introduction, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT content, created_at, id, profile_id, updated_at
		FROM profile_introduction
		WHERE profile_id = $1
	`, profileID)

	var introduction Introduction
	err := row.Scan(
		&introduction.Content, &introduction.CreatedAt, &introduction.ID,
		&introduction.ProfileID, &introduction.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Introduction{}, ErrIntroductionNotFound
	}
	if err != nil {
		return Introduction{}, fmt.Errorf("get introduction: %w", err)
	}
	return introduction, nil
}

func (repository *PostgresRepository) SaveIntroduction(ctx context.Context, introduction Introduction) (Introduction, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO profile_introduction (content, id, profile_id, updated_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (profile_id) DO UPDATE SET
			content = EXCLUDED.content,
			updated_at = EXCLUDED.updated_at
		RETURNING content, created_at, id, profile_id, updated_at
	`, introduction.Content, introduction.ID, introduction.ProfileID, introduction.UpdatedAt)

	var saved Introduction
	err := row.Scan(
		&saved.Content, &saved.CreatedAt, &saved.ID, &saved.ProfileID, &saved.UpdatedAt,
	)
	if err != nil {
		return Introduction{}, fmt.Errorf("save introduction: %w", err)
	}
	return saved, nil
}
