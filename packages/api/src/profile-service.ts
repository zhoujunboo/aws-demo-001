import { env } from "@aws-demo-001/env/server";
import { z } from "zod";

const REQUEST_TIMEOUT_MS = 10_000;

const profileSchema = z.object({
	avatarUrl: z.url(),
	bio: z.string().nullable(),
	createdAt: z.coerce.date(),
	followers: z.number().int().nonnegative(),
	following: z.number().int().nonnegative(),
	githubCreatedAt: z.coerce.date(),
	githubId: z.number().int().positive(),
	id: z.uuid(),
	location: z.string().nullable(),
	login: z.string().min(1),
	name: z.string().nullable(),
	profileUrl: z.url(),
	publicRepos: z.number().int().nonnegative(),
	updatedAt: z.coerce.date(),
});

const introductionSchema = z.object({
	introduction: z.string().min(1),
	profile: profileSchema,
});

const deleteResultSchema = z.object({ id: z.uuid() });
const errorSchema = z.object({ error: z.string().min(1) });

export class ProfileServiceError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProfileServiceError";
		this.statusCode = statusCode;
	}
}

const request = async (path: string, init?: RequestInit): Promise<unknown> => {
	let response: Response;
	try {
		response = await fetch(`${env.PROFILE_SERVICE_URL}${path}`, {
			...init,
			headers: {
				Accept: "application/json",
				...init?.headers,
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (cause) {
		// biome-ignore lint/style/useErrorCause: ProfileServiceError forwards ErrorOptions to Error.
		throw new ProfileServiceError("Profile service is unavailable.", 503, {
			cause,
		});
	}

	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const parsedError = errorSchema.safeParse(body);
		throw new ProfileServiceError(
			parsedError.success
				? parsedError.data.error
				: "Profile service request failed.",
			response.status
		);
	}
	return body;
};

export const listProfiles = async () => {
	const response = await request("/v1/profiles");
	return z.array(profileSchema).parse(response);
};

export const generateProfileIntroduction = async (username: string) => {
	const response = await request(
		`/v1/profiles/${encodeURIComponent(username)}/introduction`,
		{ method: "POST" }
	);
	return introductionSchema.parse(response);
};

export const deleteProfile = async (id: string) => {
	const response = await request(`/v1/profiles/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	return deleteResultSchema.parse(response);
};
