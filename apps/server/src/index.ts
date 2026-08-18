import { createContext } from "@aws-demo-001/api/context";
import { appRouter } from "@aws-demo-001/api/routers/index";
import { auth } from "@aws-demo-001/auth";
import { env } from "@aws-demo-001/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		credentials: true,
		origin: env.CORS_ORIGIN,
	})
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
