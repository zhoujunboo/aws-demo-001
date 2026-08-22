import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { z } from "zod";

const HTTP_TIMEOUT_MS = 30_000;
const MAX_RECEIVE_COUNT = 3;
const TRAILING_SLASH_PATTERN = /\/$/;

const workflowMessageSchema = z.object({
	workflowId: z.string().uuid(),
});

const workflowStepSchema = z.object({
	agentId: z.string(),
	agentName: z.string(),
	attemptCount: z.number().int().nonnegative(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	errorCode: z.string().optional(),
	fairnessScore: z.number(),
	id: z.string().uuid(),
	instruction: z.string(),
	matchScore: z.number(),
	output: z.string().optional(),
	startedAt: z.string().nullable(),
	status: z.string(),
	stepOrder: z.number().int().positive(),
	title: z.string(),
	updatedAt: z.string(),
	workflowId: z.string().uuid(),
});

const workflowSchema = z.object({
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	description: z.string(),
	estimatedPriceCents: z.number().int().nonnegative(),
	id: z.string().uuid(),
	reliabilityScore: z.number(),
	startedAt: z.string().nullable(),
	status: z.string(),
	steps: z.array(workflowStepSchema),
	updatedAt: z.string(),
});

type Workflow = z.infer<typeof workflowSchema>;

const WorkflowState = Annotation.Root({
	workflow: Annotation<Workflow | null>,
	workflowId: Annotation<string>,
});

const terminalStatuses = new Set(["failed", "succeeded"]);

const getProfileServiceUrl = (): string => {
	const profileServiceUrl = process.env.PROFILE_SERVICE_URL?.replace(
		TRAILING_SLASH_PATTERN,
		""
	);
	if (!profileServiceUrl) {
		throw new Error("PROFILE_SERVICE_URL is required");
	}
	return profileServiceUrl;
};

const requestWorkflow = async (
	path: string,
	init?: RequestInit
): Promise<Workflow> => {
	const response = await fetch(`${getProfileServiceUrl()}${path}`, {
		...init,
		headers: {
			Accept: "application/json",
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
		signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
	});
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(`Profile service returned HTTP ${response.status}`);
	}
	return workflowSchema.parse(body);
};

const loadWorkflow = async (
	state: typeof WorkflowState.State
): Promise<Partial<typeof WorkflowState.State>> => ({
	workflow: await requestWorkflow(
		`/v1/workflows/${encodeURIComponent(state.workflowId)}`
	),
});

const startWorkflow = async (
	state: typeof WorkflowState.State
): Promise<Partial<typeof WorkflowState.State>> => ({
	workflow: await requestWorkflow(
		`/internal/v1/workflows/${encodeURIComponent(state.workflowId)}/start`,
		{ method: "POST" }
	),
});

const runNextStep = async (
	state: typeof WorkflowState.State
): Promise<Partial<typeof WorkflowState.State>> => {
	const nextStep = state.workflow?.steps.find(
		(step) => step.status !== "succeeded"
	);
	if (!nextStep) {
		return {};
	}

	const workflow = await requestWorkflow(
		`/internal/v1/workflows/${encodeURIComponent(state.workflowId)}/steps/${encodeURIComponent(nextStep.id)}/run`,
		{ method: "POST" }
	);
	const completedStep = workflow.steps.find((step) => step.id === nextStep.id);
	if (completedStep?.status !== "succeeded") {
		throw new Error(
			`Agent step ${nextStep.id} failed: ${completedStep?.errorCode ?? "unknown error"}`
		);
	}
	return { workflow };
};

const completeWorkflow = async (
	state: typeof WorkflowState.State
): Promise<Partial<typeof WorkflowState.State>> => ({
	workflow: await requestWorkflow(
		`/internal/v1/workflows/${encodeURIComponent(state.workflowId)}/complete`,
		{ body: JSON.stringify({ failed: false }), method: "POST" }
	),
});

const routeAfterLoad = (state: typeof WorkflowState.State): string => {
	if (state.workflow && terminalStatuses.has(state.workflow.status)) {
		return END;
	}
	return state.workflow?.status === "running" ? "runStep" : "start";
};

const routeAfterStep = (state: typeof WorkflowState.State): string => {
	const hasPendingStep = state.workflow?.steps.some(
		(step) => step.status !== "succeeded"
	);
	return hasPendingStep ? "runStep" : "complete";
};

const workflowGraph = new StateGraph(WorkflowState)
	.addNode("load", loadWorkflow)
	.addNode("start", startWorkflow)
	.addNode("runStep", runNextStep)
	.addNode("complete", completeWorkflow)
	.addEdge(START, "load")
	.addConditionalEdges("load", routeAfterLoad, ["start", "runStep", END])
	.addEdge("start", "runStep")
	.addConditionalEdges("runStep", routeAfterStep, ["runStep", "complete"])
	.addEdge("complete", END)
	.compile();

const markWorkflowFailed = async (workflowId: string): Promise<void> => {
	await requestWorkflow(
		`/internal/v1/workflows/${encodeURIComponent(workflowId)}/complete`,
		{ body: JSON.stringify({ failed: true }), method: "POST" }
	);
};

const processRecord = async (record: SQSRecord): Promise<void> => {
	const messageBody: unknown = JSON.parse(record.body);
	const { workflowId } = workflowMessageSchema.parse(messageBody);
	const receiveCount = Number.parseInt(
		record.attributes.ApproximateReceiveCount,
		10
	);

	try {
		await workflowGraph.invoke({ workflow: null, workflowId });
		console.info("[AgentWorkflowWorker] Workflow completed", {
			receiveCount,
			workflowId,
		});
	} catch (error) {
		if (receiveCount >= MAX_RECEIVE_COUNT) {
			try {
				await markWorkflowFailed(workflowId);
			} catch (completionError) {
				console.error(
					"[AgentWorkflowWorker] Failed to persist terminal state",
					{
						completionError,
						workflowId,
					}
				);
			}
		}
		throw error;
	}
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
	const processInOrder = async (
		recordIndex: number
	): Promise<SQSBatchResponse["batchItemFailures"]> => {
		const record = event.Records[recordIndex];
		if (!record) {
			return [];
		}
		try {
			await processRecord(record);
			return processInOrder(recordIndex + 1);
		} catch (error) {
			console.error("[AgentWorkflowWorker] Workflow execution failed", {
				error,
				messageId: record.messageId,
				receiveCount: record.attributes.ApproximateReceiveCount,
			});
			return event.Records.slice(recordIndex).map((unprocessedRecord) => ({
				itemIdentifier: unprocessedRecord.messageId,
			}));
		}
	};

	const batchItemFailures = await processInOrder(0);
	return { batchItemFailures };
};
