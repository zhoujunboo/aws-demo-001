import { AGENT_CATALOG, isAgentId } from "./agent-catalog";
import {
	type ErrorResponse,
	type RunSuccessResponse,
	runRequestSchema,
} from "./contracts";
import { runAgent } from "./run-agent";

interface Env {
	AGENT_API_KEY?: string;
	AI: {
		run: (model: string, input: unknown) => Promise<unknown>;
	};
	WORKERS_AI_MODEL: string;
}

const MAX_BODY_BYTES = 45_000;
const AGENT_TIMEOUT_MS = 55_000;
const AGENT_RUN_PATH_PATTERN = /^\/v1\/agents\/([^/]+)\/run$/;

const jsonResponse = (body: unknown, status = 200): Response =>
	Response.json(body, {
		headers: { "Cache-Control": "no-store" },
		status,
	});

const errorResponse = (
	code: string,
	message: string,
	status: number,
	requestId?: string
): Response => {
	const body: ErrorResponse = {
		error: { code, message },
		...(requestId ? { requestId } : {}),
		status: "failed",
	};
	return jsonResponse(body, status);
};

const getAgentId = (pathname: string): string | undefined => {
	const match = pathname.match(AGENT_RUN_PATH_PATTERN);
	return match?.[1];
};

const isAuthorized = (request: Request, env: Env): boolean => {
	if (!env.AGENT_API_KEY) {
		return false;
	}
	return request.headers.get("Authorization") === `Bearer ${env.AGENT_API_KEY}`;
};

const handleRunRequest = async (
	request: Request,
	env: Env,
	agentId: string
): Promise<Response> => {
	if (!env.AGENT_API_KEY) {
		return errorResponse(
			"service_not_configured",
			"AGENT_API_KEY is not configured",
			503
		);
	}

	if (!isAuthorized(request, env)) {
		return errorResponse("unauthorized", "Invalid bearer token", 401);
	}

	if (!isAgentId(agentId)) {
		return errorResponse("agent_not_found", "Unknown agent", 404);
	}

	const contentLength = Number(request.headers.get("Content-Length") ?? "0");
	if (contentLength > MAX_BODY_BYTES) {
		return errorResponse("payload_too_large", "Request body is too large", 413);
	}

	let payload: unknown;
	try {
		const rawBody = await request.text();
		if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
			return errorResponse(
				"payload_too_large",
				"Request body is too large",
				413
			);
		}
		payload = JSON.parse(rawBody);
	} catch {
		return errorResponse(
			"invalid_json",
			"Request body must be valid JSON",
			400
		);
	}

	const parsed = runRequestSchema.safeParse(payload);
	if (!parsed.success) {
		return errorResponse(
			"invalid_request",
			parsed.error.issues[0]?.message ?? "Invalid request",
			400
		);
	}

	try {
		const text = await runAgent(
			agentId,
			parsed.data,
			env,
			AbortSignal.timeout(AGENT_TIMEOUT_MS)
		);
		const body: RunSuccessResponse = {
			agentId,
			output: { text },
			requestId: parsed.data.requestId,
			status: "succeeded",
		};
		return jsonResponse(body);
	} catch (error) {
		const isTimeout =
			error instanceof DOMException && error.name === "TimeoutError";
		console.error("Agent execution failed", {
			agentId,
			error: error instanceof Error ? error.message : "Unknown error",
			requestId: parsed.data.requestId,
		});
		return errorResponse(
			isTimeout ? "agent_timeout" : "agent_execution_failed",
			isTimeout ? "Agent execution timed out" : "Agent execution failed",
			isTimeout ? 504 : 502,
			parsed.data.requestId
		);
	}
};

export default {
	fetch(request: Request, env: Env): Promise<Response> | Response {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/health") {
			return jsonResponse({
				agents: Object.values(AGENT_CATALOG).map(
					({ description, id, name }) => ({
						description,
						id,
						name,
					})
				),
				service: "resume-deep-agents",
				status: "ok",
			});
		}

		const agentId = getAgentId(url.pathname);
		if (request.method === "POST" && agentId) {
			return handleRunRequest(request, env, agentId);
		}

		return errorResponse("not_found", "Route not found", 404);
	},
};
