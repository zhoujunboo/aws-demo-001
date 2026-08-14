import {
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const githubProfile = pgTable(
	"github_profile",
	{
		avatarUrl: text("avatar_url").notNull(),
		bio: text("bio"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		followers: integer("followers").notNull(),
		following: integer("following").notNull(),
		githubCreatedAt: timestamp("github_created_at", {
			withTimezone: true,
		}).notNull(),
		githubId: integer("github_id").notNull(),
		id: text("id").primaryKey(),
		location: text("location"),
		login: text("login").notNull(),
		name: text("name"),
		profileUrl: text("profile_url").notNull(),
		publicRepos: integer("public_repos").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [uniqueIndex("github_profile_github_id_idx").on(table.githubId)]
);
