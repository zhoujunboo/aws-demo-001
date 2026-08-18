import { env } from "@aws-demo-001/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

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

export const getGithubUserByUsername = async (username: string) => {
	let response: Response;

	try {
		response = await fetch(
			`https://api.github.com/users/${encodeURIComponent(username)}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					...(env.GITHUB_TOKEN
						? { Authorization: `Bearer ${env.GITHUB_TOKEN}` }
						: {}),
					"User-Agent": "aws-demo-001-card-service",
					"X-GitHub-Api-Version": "2022-11-28",
				},
				signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			}
		);
	} catch (cause) {
		// biome-ignore lint/style/useErrorCause: TRPCError receives cause through its options object.
		throw new TRPCError({
			cause,
			code: "BAD_GATEWAY",
			message: "无法连接 GitHub，请稍后重试。",
		});
	}

	if (response.status === 404) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "GitHub 用户不存在。",
		});
	}

	if (response.status === 403 || response.status === 429) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "GitHub API 请求频率已达上限，请稍后再试。",
		});
	}

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: `GitHub 返回了异常状态码 ${response.status}。`,
		});
	}

	const result = githubUserSchema.safeParse(await response.json());
	if (!result.success) {
		throw new TRPCError({
			cause: result.error,
			code: "BAD_GATEWAY",
			message: "GitHub 返回了无法识别的用户资料。",
		});
	}

	return result.data;
};
