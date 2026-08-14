import {
	deleteGithubProfile,
	listGithubProfiles,
	saveGithubProfile,
} from "@aws-demo-001/db/github-profiles";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";

const githubUserSchema = z.object({
	avatar_url: z.url(),
	bio: z.string().nullable(),
	created_at: z.iso.datetime(),
	followers: z.number().int().nonnegative(),
	following: z.number().int().nonnegative(),
	html_url: z.url(),
	id: z.number().int().positive(),
	location: z.string().nullable(),
	login: z.string().min(1),
	name: z.string().nullable(),
	public_repos: z.number().int().nonnegative(),
});

const getGithubUser = async (token: string) => {
	let response: Response;

	try {
		response = await fetch("https://api.github.com/user", {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"User-Agent": "aws-demo-001",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
	} catch (cause) {
		// biome-ignore lint/style/useErrorCause: TRPCError supports cause through its options object.
		throw new TRPCError({
			cause,
			code: "BAD_GATEWAY",
			message: "Unable to reach GitHub. Check the server network connection.",
		});
	}

	if (response.status === 401) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "The GitHub token is invalid.",
		});
	}

	if (response.status === 403 || response.status === 429) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "GitHub rejected the request or the API rate limit was reached.",
		});
	}

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: `GitHub returned an unexpected ${response.status} response.`,
		});
	}

	const result = githubUserSchema.safeParse(await response.json());
	if (!result.success) {
		throw new TRPCError({
			cause: result.error,
			code: "BAD_GATEWAY",
			message: "GitHub returned an unexpected user profile.",
		});
	}

	return result.data;
};

export const appRouter = router({
	githubProfiles: router({
		delete: publicProcedure
			.input(z.object({ id: z.uuid() }))
			.mutation(async ({ input }) => {
				const deletedProfile = await deleteGithubProfile(input.id);

				if (!deletedProfile) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "GitHub profile not found.",
					});
				}

				return deletedProfile;
			}),
		list: publicProcedure.query(listGithubProfiles),
		saveFromToken: publicProcedure
			.input(
				z.object({
					token: z.string().trim().min(1, "Enter a GitHub token.").max(512),
				})
			)
			.mutation(async ({ input }) => {
				const profile = await getGithubUser(input.token);
				const values = {
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
				};

				return saveGithubProfile(values);
			}),
	}),
	healthCheck: publicProcedure.query(() => "OK"),
	privateData: protectedProcedure.query(({ ctx }) => ({
		message: "This is private",
		user: ctx.session.user,
	})),
});
export type AppRouter = typeof appRouter;
