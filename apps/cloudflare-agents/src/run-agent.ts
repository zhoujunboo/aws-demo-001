import { AsyncLocalStorage } from "node:async_hooks";
import type { BaseMessage } from "@langchain/core/messages";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { createDeepAgent } from "deepagents/node";
import { AGENT_CATALOG, type AgentId } from "./agent-catalog";
import { ChatCloudflareBinding } from "./cloudflare-chat-model";
import type { RunRequest } from "./contracts";

AsyncLocalStorageProviderSingleton.initializeGlobalInstance(
	new AsyncLocalStorage()
);

interface AgentRuntimeEnv {
	AI: {
		run: (model: string, input: unknown) => Promise<unknown>;
	};
	WORKERS_AI_MODEL: string;
}

const getTextContent = (message: BaseMessage): string => {
	if (typeof message.content === "string") {
		return message.content;
	}

	return message.content
		.map((part) =>
			"text" in part && typeof part.text === "string" ? part.text : ""
		)
		.join("");
};

const buildUserPrompt = ({ input }: RunRequest): string => {
	const resumeSection = input.resume
		? `\n\n已有简历：\n${input.resume}`
		: "\n\n用户没有提供已有简历，请将未知事实标记为待补充。";

	return `任务要求：\n${input.description}${resumeSection}`;
};

export const runAgent = async (
	agentId: AgentId,
	request: RunRequest,
	env: AgentRuntimeEnv,
	signal: AbortSignal
): Promise<string> => {
	const definition = AGENT_CATALOG[agentId];
	const model = new ChatCloudflareBinding({
		ai: env.AI,
		enableToolCalling: false,
		model: env.WORKERS_AI_MODEL,
	});
	const agent = createDeepAgent({
		model,
		systemPrompt: definition.systemPrompt,
	});

	const result = await agent.invoke(
		{
			messages: [{ content: buildUserPrompt(request), role: "user" }],
		},
		{ signal }
	);
	const messages = result.messages as BaseMessage[];
	const finalMessage = messages.at(-1);

	if (!finalMessage) {
		throw new Error("Agent completed without a response");
	}

	const text = getTextContent(finalMessage).trim();
	if (!text) {
		throw new Error("Agent returned an empty response");
	}

	return text;
};
