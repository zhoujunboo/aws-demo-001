import { env } from "@aws-demo-001/env/server";
import { z } from "zod";

const REQUEST_TIMEOUT_MS = 10_000;
const PREVIEW_HEADER_NAME = "X-Preview-PR";

const introductionSchema = z.object({
	content: z.string().min(1),
	createdAt: z.coerce.date(),
	id: z.uuid(),
	profileId: z.uuid(),
	updatedAt: z.coerce.date(),
});

const errorSchema = z.object({ error: z.string().min(1) });

export class ProfileServiceError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProfileServiceError";
		this.statusCode = statusCode;
	}
}

const request = async (
	path: string,
	previewId?: string,
	init?: RequestInit
): Promise<unknown> => {
	const headers = new Headers(init?.headers);
	headers.set("Accept", "application/json");
	if (previewId) {
		headers.set(PREVIEW_HEADER_NAME, previewId);
	}

	let response: Response;
	try {
		response = await fetch(`${env.PROFILE_SERVICE_URL}${path}`, {
			...init,
			headers,
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

export const generateProfileIntroduction = async (
	profileId: string,
	previewId?: string
) => {
	const response = await request(
		`/v1/profiles/${encodeURIComponent(profileId)}/introduction`,
		previewId,
		{ method: "POST" }
	);
	return introductionSchema.parse(response);
};

export const getProfileIntroduction = async (
	profileId: string,
	previewId?: string
) => {
	const response = await request(
		`/v1/profiles/${encodeURIComponent(profileId)}/introduction`,
		previewId
	);
	return introductionSchema.parse(response);
};
