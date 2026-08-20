import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	client: {
		VITE_PREVIEW_ID: z
			.string()
			.regex(/^pr-[1-9][0-9]{0,4}$/)
			.optional(),
		VITE_SERVER_URL: z.url().default("http://localhost:3000"),
	},
	clientPrefix: "VITE_",
	emptyStringAsUndefined: true,
	runtimeEnv: (
		import.meta as ImportMeta & {
			readonly env: Record<string, string | undefined>;
		}
	).env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
