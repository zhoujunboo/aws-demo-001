import { describe, expect, it } from "vitest";
import { ChatCloudflareBinding } from "../src/cloudflare-chat-model";

const GENERATED_TOOL_CALL_ID_PATTERN = /^call_/;

describe("ChatCloudflareBinding", () => {
	it("normalizes flattened Workers AI tool calls", async () => {
		const model = new ChatCloudflareBinding({
			ai: {
				run: async () => ({
					tool_calls: [
						{
							arguments: { file_path: "resume.txt" },
							name: "write_file",
						},
					],
				}),
			},
			model: "test-model",
		});
		const runnable = model.bindTools([
			{
				function: {
					name: "write_file",
					parameters: { properties: {}, type: "object" },
				},
				type: "function",
			},
		]);

		const result = await runnable.invoke([
			{ content: "Create a resume", role: "user" },
		]);

		expect(result.tool_calls?.[0]).toMatchObject({
			args: { file_path: "resume.txt" },
			name: "write_file",
			type: "tool_call",
		});
		expect(result.tool_calls?.[0]?.id).toMatch(GENERATED_TOOL_CALL_ID_PATTERN);
	});
});
