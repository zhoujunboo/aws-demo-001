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
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
    onError: ({ error, path, type, req }) => {
      console.error(
        `[tRPC Error] path: "${path}", type: "${type}", url: "${req.url}":`,
        {
          message: error.message,
          code: error.code,
          cause: error.cause,
          stack: error.stack,
        },
      );
      if (error.cause) {
        console.error("[tRPC Error Cause]:", error.cause);
      }
    },
  }),
);

app.onError((err, c) => {
  console.error(`[Hono Server Error] ${c.req.method} ${c.req.url}:`, {
    message: err.message,
    name: err.name,
    cause: err.cause,
    stack: err.stack,
  });
  if (err.cause) {
    console.error("[Hono Server Error Cause]:", err.cause);
  }
  return c.text(`Internal Server Error: ${err.message}`, 500);
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
