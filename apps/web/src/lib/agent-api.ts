import { env } from "@aws-demo-001/env/web";
import { z } from "zod";

const apiBaseUrl = env.VITE_SERVER_URL.replace(/\/$/, "");

const agentSchema = z.object({
	capabilities: z.array(z.string()),
	createdAt: z.string(),
	description: z.string(),
	embeddingModel: z.string().optional(),
	id: z.string(),
	name: z.string(),
	status: z.string(),
	updatedAt: z.string(),
	vectorIndexed: z.boolean().default(false),
});

const executionSchema = z.object({
	agentId: z.string(),
	agentName: z.string(),
	durationMs: z.number().nullable(),
	errorCode: z.string().optional(),
	id: z.string(),
	output: z.string().optional(),
	rank: z.number(),
	score: z.number(),
	status: z.string(),
	taskId: z.string(),
});

const taskSchema = z.object({
	description: z.string(),
	executions: z.array(executionSchema),
	id: z.string(),
	resume: z.string().optional(),
	status: z.string(),
});

const workflowStepSchema = z.object({
	agentId: z.string(),
	agentName: z.string(),
	attemptCount: z.number().int().nonnegative(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	errorCode: z.string().optional(),
	fairnessScore: z.number(),
	id: z.string(),
	instruction: z.string(),
	matchScore: z.number(),
	output: z.string().optional(),
	startedAt: z.string().nullable(),
	status: z.string(),
	stepOrder: z.number().int().positive(),
	title: z.string(),
	updatedAt: z.string(),
	workflowId: z.string(),
});

const workflowSchema = z.object({
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	description: z.string(),
	estimatedPriceCents: z.number().int().nonnegative(),
	id: z.string(),
	reliabilityScore: z.number(),
	startedAt: z.string().nullable(),
	status: z.string(),
	steps: z.array(workflowStepSchema),
	updatedAt: z.string(),
});

const agentsResponseSchema = z.object({ agents: z.array(agentSchema) });
const errorResponseSchema = z.object({ error: z.string() });

export type Agent = z.infer<typeof agentSchema>;
export type AgentExecution = z.infer<typeof executionSchema>;
export type AgentTask = z.infer<typeof taskSchema>;
export type AgentWorkflow = z.infer<typeof workflowSchema>;
export type AgentWorkflowStep = z.infer<typeof workflowStepSchema>;

export interface RegisterAgentInput {
	capabilities: string[];
	description: string;
	endpointUrl: string;
	id: string;
	name: string;
}

const request = async <Schema extends z.ZodType>(
	path: string,
	schema: Schema,
	init?: RequestInit
): Promise<z.infer<Schema>> => {
	const response = await fetch(`${apiBaseUrl}${path}`, {
		...init,
		headers: {
			Accept: "application/json",
			...init?.headers,
		},
	});
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const parsedError = errorResponseSchema.safeParse(body);
		throw new Error(
			parsedError.success ? parsedError.data.error : "请求失败，请稍后重试。"
		);
	}
	return schema.parse(body);
};

export const listAgents = async (): Promise<Agent[]> => {
	const response = await request("/v1/agents", agentsResponseSchema);
	return response.agents;
};

export const registerAgent = async (
	input: RegisterAgentInput
): Promise<Agent> =>
	request("/v1/agents", agentSchema, {
		body: JSON.stringify(input),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

export const createAgentTask = async (input: {
	description: string;
	resume?: string;
}): Promise<AgentTask> =>
	request("/v1/tasks", taskSchema, {
		body: JSON.stringify(input),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

export const createWorkflowPreview = async (input: {
	description: string;
}): Promise<AgentWorkflow> =>
	request("/v1/workflows/preview", workflowSchema, {
		body: JSON.stringify(input),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

export const getWorkflow = async (workflowId: string): Promise<AgentWorkflow> =>
	request(`/v1/workflows/${encodeURIComponent(workflowId)}`, workflowSchema);

export const executeWorkflow = async (
	workflowId: string
): Promise<AgentWorkflow> =>
	request(
		`/v1/workflows/${encodeURIComponent(workflowId)}/execute`,
		workflowSchema,
		{ method: "POST" }
	);
