import {
	deleteGithubProfile,
	listGithubProfiles,
	saveGithubProfile,
} from "@aws-demo-001/db/github-profiles";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getGithubUserByUsername } from "../github";
import { protectedProcedure, publicProcedure, router } from "../index";
import {
	generateProfileIntroduction,
	getProfileIntroduction,
	ProfileServiceError,
} from "../profile-service";

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

const profileErrorCodes: Partial<Record<number, TRPCErrorCode>> = {
	400: "BAD_REQUEST",
	404: "NOT_FOUND",
	429: "TOO_MANY_REQUESTS",
	502: "BAD_GATEWAY",
	503: "TIMEOUT",
	504: "TIMEOUT",
};

const toTRPCError = (error: unknown): TRPCError => {
	if (!(error instanceof ProfileServiceError)) {
		return new TRPCError({
			cause: error,
			code: "INTERNAL_SERVER_ERROR",
			message: "Profile service returned an invalid response.",
		});
	}

	const code = profileErrorCodes[error.statusCode] ?? "INTERNAL_SERVER_ERROR";

	return new TRPCError({ cause: error, code, message: error.message });
};

const callProfileService = async <Result>(
	operation: () => Promise<Result>
): Promise<Result> => {
	try {
		return await operation();
	} catch (error) {
		throw toTRPCError(error);
	}
};

export const appRouter = router({
	githubProfiles: router({
		createFromUsername: publicProcedure
			.input(
				z.object({
					username: z
						.string()
						.trim()
						.min(1, "请输入 GitHub 用户名。")
						.max(39)
						.regex(
							/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i,
							"请输入有效的 GitHub 用户名。"
						),
				})
			)
			.mutation(async ({ input }) => {
				const profile = await getGithubUserByUsername(input.username);
				return saveGithubProfile({
					avatarUrl: profile.avatar_url,
					bio: profile.bio,
					followers: profile.followers,
					following: profile.following,
					githubCreatedAt: new Date(profile.created_at),
					githubId: profile.id,
					id: crypto.randomUUID(),
					location: profile.location,
					login: profile.login,
					name: profile.name,
					profileUrl: profile.html_url,
					publicRepos: profile.public_repos,
					updatedAt: new Date(),
				});
			}),
		delete: publicProcedure
			.input(z.object({ id: z.uuid() }))
			.mutation(async ({ input }) => {
				const deletedProfile = await deleteGithubProfile(input.id);
				if (!deletedProfile) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "名片不存在。",
					});
				}

				return deletedProfile;
			}),
		list: publicProcedure.query(listGithubProfiles),
	}),
	healthCheck: publicProcedure.query(() => "OK"),
	privateData: protectedProcedure.query(({ ctx }) => ({
		message: "This is private",
		user: ctx.session.user,
	})),
	profileIntroductions: router({
		generate: publicProcedure
			.input(z.object({ profileId: z.uuid() }))
			.mutation(({ input }) =>
				callProfileService(() => generateProfileIntroduction(input.profileId))
			),
		get: publicProcedure
			.input(z.object({ profileId: z.uuid() }))
			.query(async ({ input }) => {
				try {
					return await getProfileIntroduction(input.profileId);
				} catch (error) {
					if (
						error instanceof ProfileServiceError &&
						error.statusCode === 404
					) {
						return null;
					}
					throw toTRPCError(error);
				}
			}),
	}),
});
export type AppRouter = typeof appRouter;
