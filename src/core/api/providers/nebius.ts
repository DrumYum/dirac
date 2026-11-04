import { type ModelInfo, type NebiusModelId, nebiusDefaultModelId, nebiusModels } from "@shared/api"
import OpenAI from "openai"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { DiracStorageMessage } from "@/shared/messages/content"
import { createOpenAIClient } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import { ApiHandler, CommonApiHandlerOptions } from "../index"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

interface NebiusHandlerOptions extends CommonApiHandlerOptions {
	nebiusApiKey?: string
	apiModelId?: string
}

export class NebiusHandler implements ApiHandler {
	private client: OpenAI | undefined

	constructor(private readonly options: NebiusHandlerOptions) {}

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.nebiusApiKey) {
				throw new Error("Nebius API key is required")
			}
			try {
				this.client = createOpenAIClient({
					baseURL: "https://api.studio.nebius.ai/v1",
					apiKey: this.options.nebiusApiKey,
				})
			} catch (error) {
				throw new Error(`Error creating Nebius client: ${error.message}`)
			}
		}
		return this.client
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: DiracStorageMessage[], tools?: OpenAITool[]): ApiStream {
		const client = this.ensureClient()
		const model = this.getModel()

		const preserveThinking = model.info.preserveThinking ?? "off"
		const convertedMessages = convertToOpenAiMessages(
			messages,
			undefined,
			this.getModel().info.supportsImages !== false,
			preserveThinking as any,
		)
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertedMessages,
		]
		const stream = await client.chat.completions.create({
			model: model.id,
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
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.apiModelId

		if (modelId !== undefined && modelId in nebiusModels) {
			const info = nebiusModels[modelId as NebiusModelId] as ModelInfo
			return { id: modelId, info: { ...info, preserveThinking: info.preserveThinking ?? (modelId.includes("DeepSeek-R1") || info.preserveThinking === "all" ? "all" : "off") } }
		}
		if (modelId !== undefined) {
			// Fail loudly: silently swapping the requested model for the default
			// misattributes cost/behavior to a model the user never selected.
			Logger.error(
				`[NebiusHandler] Unknown Nebius model '${modelId}'; falling back to ${nebiusDefaultModelId}. Available: ${Object.keys(nebiusModels).join(", ")}`,
			)
		}
		const info = nebiusModels[nebiusDefaultModelId] as ModelInfo
		return { id: nebiusDefaultModelId, info: { ...info, preserveThinking: info.preserveThinking ?? "off" } }
	}
}
