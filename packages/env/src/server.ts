import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		DATABASE_HOST: z.string().min(1).optional(),
		DATABASE_NAME: z.string().min(1).optional(),
		DATABASE_PASSWORD: z.string().min(1).optional(),
		DATABASE_PORT: z.coerce.number().int().positive().max(65_535).optional(),
		DATABASE_URL: z.string().min(1).optional(),
		DATABASE_USERNAME: z.string().min(1).optional(),
		GITHUB_TOKEN: z.string().min(1).optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PROFILE_SERVICE_URL: z.url().default("http://localhost:8080"),
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
