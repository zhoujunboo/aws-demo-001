package profile

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("profile not found")

type Repository interface {
	Delete(context.Context, string) error
	List(context.Context) ([]Profile, error)
	Save(context.Context, Profile) (Profile, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) List(ctx context.Context) ([]Profile, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT avatar_url, bio, created_at, followers, following, github_created_at,
		       github_id, id, location, login, name, profile_url, public_repos, updated_at
		FROM github_profile
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("query profiles: %w", err)
	}
	defer rows.Close()

	profiles, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Profile])
	if err != nil {
		return nil, fmt.Errorf("collect profiles: %w", err)
	}
	return profiles, nil
}

func (repository *PostgresRepository) Save(ctx context.Context, profile Profile) (Profile, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO github_profile (
			avatar_url, bio, followers, following, github_created_at, github_id, id,
			location, login, name, profile_url, public_repos, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (github_id) DO UPDATE SET
			avatar_url = EXCLUDED.avatar_url,
			bio = EXCLUDED.bio,
			followers = EXCLUDED.followers,
			following = EXCLUDED.following,
			github_created_at = EXCLUDED.github_created_at,
			location = EXCLUDED.location,
			login = EXCLUDED.login,
			name = EXCLUDED.name,
			profile_url = EXCLUDED.profile_url,
			public_repos = EXCLUDED.public_repos,
			updated_at = EXCLUDED.updated_at
		RETURNING avatar_url, bio, created_at, followers, following, github_created_at,
		          github_id, id, location, login, name, profile_url, public_repos, updated_at
	`, profile.AvatarURL, profile.Bio, profile.Followers, profile.Following,
		profile.GitHubCreatedAt, profile.GitHubID, profile.ID, profile.Location,
		profile.Login, profile.Name, profile.ProfileURL, profile.PublicRepos, profile.UpdatedAt)

	var saved Profile
	err := row.Scan(
		&saved.AvatarURL, &saved.Bio, &saved.CreatedAt, &saved.Followers,
		&saved.Following, &saved.GitHubCreatedAt, &saved.GitHubID, &saved.ID,
		&saved.Location, &saved.Login, &saved.Name, &saved.ProfileURL,
		&saved.PublicRepos, &saved.UpdatedAt,
	)
	if err != nil {
		return Profile{}, fmt.Errorf("save profile: %w", err)
	}
	return saved, nil
}

func (repository *PostgresRepository) Delete(ctx context.Context, id string) error {
	commandTag, err := repository.pool.Exec(ctx, "DELETE FROM github_profile WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete profile: %w", err)
	}
	if commandTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
