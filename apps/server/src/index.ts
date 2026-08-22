import { createContext } from "@aws-demo-001/api/context";
import { appRouter } from "@aws-demo-001/api/routers/index";
import { auth } from "@aws-demo-001/auth";
import { checkDatabaseConnection } from "@aws-demo-001/db";
import { env } from "@aws-demo-001/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const PREVIEW_WORKER_NAME_PATTERN = /^github-profile-web-pr-[1-9][0-9]{0,4}$/;
const PROFILE_SERVICE_HEALTH_TIMEOUT_MS = 5000;
const PROFILE_SERVICE_TASK_TIMEOUT_MS = 28_000;
const productionFrontendUrl = new URL(env.CORS_ORIGIN);
const workersDevSuffix = productionFrontendUrl.hostname.endsWith(".workers.dev")
	? productionFrontendUrl.hostname.split(".").slice(1).join(".")
	: null;

const resolveCorsOrigin = (origin: string): string | null => {
	if (origin === env.CORS_ORIGIN) {
		return origin;
	}

	try {
		const candidateUrl = new URL(origin);
		const [workerName, ...hostnameSuffix] = candidateUrl.hostname.split(".");
		const isPreviewOrigin =
			candidateUrl.protocol === "https:" &&
			candidateUrl.port === "" &&
			workersDevSuffix !== null &&
			PREVIEW_WORKER_NAME_PATTERN.test(workerName ?? "") &&
			hostnameSuffix.join(".") === workersDevSuffix;
		return isPreviewOrigin ? origin : null;
	} catch {
		return null;
	}
};

const app = new Hono();

const checkProfileService = async (): Promise<void> => {
	const response = await fetch(`${env.PROFILE_SERVICE_URL}/healthz`, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(PROFILE_SERVICE_HEALTH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(
			`Profile service health check returned ${response.status}.`
		);
	}
};

const proxyProfileService = async (
	request: Request,
	path: string
): Promise<Response> => {
	const headers = new Headers();
	headers.set("Accept", "application/json");
	const contentType = request.headers.get("Content-Type");
	if (contentType) {
		headers.set("Content-Type", contentType);
	}

	const body =
		request.method === "GET" ? undefined : await request.arrayBuffer();
	const response = await fetch(`${env.PROFILE_SERVICE_URL}${path}`, {
		body,
		headers,
		method: request.method,
		signal: AbortSignal.timeout(PROFILE_SERVICE_TASK_TIMEOUT_MS),
	});
	return new Response(response.body, {
		headers: response.headers,
		status: response.status,
	});
};

app.use(logger());
app.use(
	"/*",
	cors({
		allowHeaders: ["Content-Type", "Authorization", "X-Preview-PR"],
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		credentials: true,
		origin: resolveCorsOrigin,
	})
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get("/readyz", async (c) => {
	try {
		await Promise.all([checkDatabaseConnection(), checkProfileService()]);
		return c.json({
			checks: { database: "ok", profileService: "ok" },
			status: "ready",
		});
	} catch (error) {
		console.error("[Readiness Check] Dependency check failed", { error });
		return c.json({ status: "not_ready" }, 503);
	}
});

app.get("/v1/agents", (c) => proxyProfileService(c.req.raw, "/v1/agents"));
app.post("/v1/agents", (c) => proxyProfileService(c.req.raw, "/v1/agents"));
app.post("/v1/tasks", (c) => proxyProfileService(c.req.raw, "/v1/tasks"));
app.get("/v1/tasks/:taskId", (c) =>
	proxyProfileService(
		c.req.raw,
		`/v1/tasks/${encodeURIComponent(c.req.param("taskId"))}`
	)
);
app.post("/v1/workflows/preview", (c) =>
	proxyProfileService(c.req.raw, "/v1/workflows/preview")
);
app.get("/v1/workflows/:workflowId", (c) =>
	proxyProfileService(
		c.req.raw,
		`/v1/workflows/${encodeURIComponent(c.req.param("workflowId"))}`
	)
);
app.post("/v1/workflows/:workflowId/execute", (c) =>
	proxyProfileService(
		c.req.raw,
		`/v1/workflows/${encodeURIComponent(c.req.param("workflowId"))}/execute`
	)
);

app.use(
	"/trpc/*",
	trpcServer({
		createContext: (_opts, context) => createContext({ context }),
		onError: ({ error, path, type, req }) => {
			console.error(
				`[tRPC Error] path: "${path}", type: "${type}", url: "${req.url}":`,
				{
					cause: error.cause,
					code: error.code,
					message: error.message,
					stack: error.stack,
				}
			);
			if (error.cause) {
				console.error("[tRPC Error Cause]:", error.cause);
			}
		},
		router: appRouter,
	})
);

app.onError((err, c) => {
	console.error(`[Hono Server Error] ${c.req.method} ${c.req.url}:`, {
		cause: err.cause,
		message: err.message,
		name: err.name,
		stack: err.stack,
	});
	if (err.cause) {
		console.error("[Hono Server Error Cause]:", err.cause);
	}
	return c.text(`Internal Server Error: ${err.message}`, 500);
});

app.get("/", (c) => c.text("OK"));

export default app;
