import type {
	BaseLanguageModelCallOptions,
	BaseLanguageModelInput,
} from "@langchain/core/language_models/base";
import {
	BaseChatModel,
	type BaseChatModelParams,
	type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import {
	AIMessage,
	type AIMessageChunk,
	type BaseMessage,
	isAIMessage,
	isHumanMessage,
	isSystemMessage,
	isToolMessage,
} from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { type Runnable, RunnableBinding } from "@langchain/core/runnables";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";

interface WorkersAiBinding {
	run: (model: string, input: unknown) => Promise<unknown>;
}

interface CloudflareChatModelInput extends BaseChatModelParams {
	ai: WorkersAiBinding;
	enableToolCalling?: boolean;
	maxTokens?: number;
	model: string;
	temperature?: number;
}

interface CloudflareCallOptions extends BaseLanguageModelCallOptions {
	tools?: BindToolsInput[];
}

type WorkersAiToolCall = {
	id?: string;
	type?: "function";
} & (
	| {
			function: {
				arguments: string | Record<string, unknown>;
				name: string;
			};
	  }
	| {
			arguments: string | Record<string, unknown>;
			name: string;
	  }
);

interface WorkersAiResponse {
	response?: string;
	tool_calls?: WorkersAiToolCall[];
	usage?: Record<string, number>;
}

const messageContentToText = (message: BaseMessage): string => {
	if (typeof message.content === "string") {
		return message.content;
	}

	return message.content
		.map((part) =>
			"text" in part && typeof part.text === "string" ? part.text : ""
		)
		.join("");
};

const parseToolArguments = (
	value: string | Record<string, unknown>
): Record<string, unknown> => {
	if (typeof value !== "string") {
		return value;
	}

	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
};

const toLangChainToolCall = (toolCall: WorkersAiToolCall) => {
	const functionCall = "function" in toolCall ? toolCall.function : toolCall;

	return {
		args: parseToolArguments(functionCall.arguments),
		id: toolCall.id ?? `call_${crypto.randomUUID()}`,
		name: functionCall.name,
		type: "tool_call" as const,
	};
};

const toWorkersAiMessage = (message: BaseMessage): Record<string, unknown> => {
	const content = messageContentToText(message);

	if (isSystemMessage(message)) {
		return { content, role: "system" };
	}

	if (isHumanMessage(message)) {
		return { content, role: "user" };
	}

	if (isToolMessage(message)) {
		return {
			content,
			role: "tool",
			tool_call_id: message.tool_call_id,
		};
	}

	if (isAIMessage(message)) {
		const toolCalls = message.tool_calls?.map((toolCall) => ({
			function: {
				arguments: JSON.stringify(toolCall.args),
				name: toolCall.name,
			},
			id: toolCall.id,
			type: "function" as const,
		}));

		return {
			content,
			role: "assistant",
			...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
		};
	}

	return { content, role: "user" };
};

export class ChatCloudflareBinding extends BaseChatModel<CloudflareCallOptions> {
	private readonly ai: WorkersAiBinding;
	private readonly enableToolCalling: boolean;
	private readonly maxTokens: number;
	private readonly model: string;
	private readonly temperature: number;

	constructor(fields: CloudflareChatModelInput) {
		super(fields);
		this.ai = fields.ai;
		this.enableToolCalling = fields.enableToolCalling ?? true;
		this.maxTokens = fields.maxTokens ?? 1800;
		this.model = fields.model;
		this.temperature = fields.temperature ?? 0.2;
	}

	_llmType(): string {
		return "cloudflare-workers-ai";
	}

	bindTools(
		tools: BindToolsInput[],
		kwargs?: Partial<CloudflareCallOptions>
	): Runnable<BaseLanguageModelInput, AIMessageChunk, CloudflareCallOptions> {
		return new RunnableBinding({
			bound: this,
			config: {},
			kwargs: { ...kwargs, tools },
		});
	}

	async _generate(
		messages: BaseMessage[],
		options: CloudflareCallOptions
	): Promise<ChatResult> {
		options.signal?.throwIfAborted();

		const response = (await this.ai.run(this.model, {
			max_tokens: this.maxTokens,
			messages: messages.map(toWorkersAiMessage),
			temperature: this.temperature,
			...(this.enableToolCalling && options.tools
				? { tools: options.tools.map((tool) => convertToOpenAITool(tool)) }
				: {}),
		})) as WorkersAiResponse;

		const toolCalls = response.tool_calls?.map(toLangChainToolCall);

		return {
			generations: [
				{
					message: new AIMessage({
						content: response.response ?? "",
						tool_calls: toolCalls,
					}),
					text: response.response ?? "",
				},
			],
			llmOutput: response.usage ? { usage: response.usage } : undefined,
		};
	}
}
