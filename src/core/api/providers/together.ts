import { ModelInfo, openAiModelInfoSaneDefaults } from "@shared/api"
import OpenAI from "openai"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { DiracStorageMessage } from "@/shared/messages/content"
import { createOpenAIClient } from "@/shared/net"
import { ApiHandler, CommonApiHandlerOptions } from "../index"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { formatOpenAiCompatibleUsage } from "../transform/openai-usage"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

interface TogetherHandlerOptions extends CommonApiHandlerOptions {
	togetherApiKey?: string
	togetherModelId?: string
}

export class TogetherHandler implements ApiHandler {
	private options: TogetherHandlerOptions
	private client: OpenAI | undefined

	constructor(options: TogetherHandlerOptions) {
		this.options = options
	}

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.togetherApiKey) {
				throw new Error("Together API key is required")
			}
			try {
				this.client = createOpenAIClient({
					baseURL: "https://api.together.xyz/v1",
					apiKey: this.options.togetherApiKey,
				})
			} catch (error: any) {
				throw new Error(`Error creating Together client: ${error.message}`)
			}
		}
		return this.client
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: DiracStorageMessage[], tools?: OpenAITool[]): ApiStream {
		const client = this.ensureClient()
		const modelId = this.options.togetherModelId ?? ""
		const model = this.getModel()

		const preserveThinking = model.info.preserveThinking ?? "off" // resolved in getModel()
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(
				messages,
				undefined,
				this.getModel().info.supportsImages !== false,
				preserveThinking as any,
			),
		]

		const stream = await client.chat.completions.create({
			model: modelId,
			messages: openAiMessages,
			temperature: 0,
			stream: true,
			stream_options: { include_usage: true },
			...getOpenAIToolParams(tools),
		})
		const toolCallProcessor = new ToolCallProcessor()
		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (delta?.tool_calls) {
				yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls)
			}

			if (delta && "reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					reasoning: (delta.reasoning_content as string | undefined) || "",
				}
			}

			if (chunk.usage) {
				yield formatOpenAiCompatibleUsage(chunk.usage, this.getModel().info)
			}
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.togetherModelId ?? "",
			info: { ...openAiModelInfoSaneDefaults, preserveThinking: (this.options.togetherModelId ?? "").includes("deepseek") ? "all" : "off" },
		}
	}
}
