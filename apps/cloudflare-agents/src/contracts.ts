import { z } from "zod";

const MAX_DESCRIPTION_LENGTH = 8000;
const MAX_RESUME_LENGTH = 30_000;

export const runRequestSchema = z
	.object({
		input: z
			.object({
				description: z.string().trim().min(10).max(MAX_DESCRIPTION_LENGTH),
				resume: z.string().trim().max(MAX_RESUME_LENGTH).optional(),
			})
			.strict(),
		requestId: z.string().trim().min(1).max(100),
	})
	.strict();

export type RunRequest = z.infer<typeof runRequestSchema>;

export interface RunSuccessResponse {
	agentId: string;
	output: {
		text: string;
	};
	requestId: string;
	status: "succeeded";
}

export interface ErrorResponse {
	error: {
		code: string;
		message: string;
	};
	requestId?: string;
	status: "failed";
}
