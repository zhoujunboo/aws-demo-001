import { describe, expect, it } from "vitest";
import { runRequestSchema } from "../src/contracts";

describe("runRequestSchema", () => {
	it("accepts a valid agent request", () => {
		const result = runRequestSchema.safeParse({
			input: { description: "Generate a frontend engineer resume" },
			requestId: "run-001",
		});

		expect(result.success).toBe(true);
	});

	it("rejects unknown input fields", () => {
		const result = runRequestSchema.safeParse({
			input: {
				description: "Generate a frontend engineer resume",
				unexpected: true,
			},
			requestId: "run-001",
		});

		expect(result.success).toBe(false);
	});
});
