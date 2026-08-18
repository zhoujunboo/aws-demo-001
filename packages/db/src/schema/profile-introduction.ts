import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { githubProfile } from "./github-profile";

export const profileIntroduction = pgTable(
	"profile_introduction",
	{
		content: text("content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => githubProfile.id, { onDelete: "cascade" }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("profile_introduction_profile_id_idx").on(table.profileId),
	]
);
