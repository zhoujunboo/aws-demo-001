import { desc, eq } from "drizzle-orm";

import { db } from "./index";
import { githubProfile } from "./schema/github-profile";

export type GithubProfileValues = typeof githubProfile.$inferInsert;

export const listGithubProfiles = () =>
	db.select().from(githubProfile).orderBy(desc(githubProfile.updatedAt));

export const saveGithubProfile = async (values: GithubProfileValues) => {
	const [savedProfile] = await db
		.insert(githubProfile)
		.values(values)
		.onConflictDoUpdate({
			set: {
				avatarUrl: values.avatarUrl,
				bio: values.bio,
				followers: values.followers,
				following: values.following,
				githubCreatedAt: values.githubCreatedAt,
				location: values.location,
				login: values.login,
				name: values.name,
				profileUrl: values.profileUrl,
				publicRepos: values.publicRepos,
				updatedAt: values.updatedAt,
			},
			target: githubProfile.githubId,
		})
		.returning();

	return savedProfile;
};

export const deleteGithubProfile = async (id: string) => {
	const [deletedProfile] = await db
		.delete(githubProfile)
		.where(eq(githubProfile.id, id))
		.returning({ id: githubProfile.id });

	return deletedProfile;
};
