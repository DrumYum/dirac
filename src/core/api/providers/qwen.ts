import {
    InternationalQwenModelId,
    internationalQwenDefaultModelId,
    internationalQwenModels,
    MainlandQwenModelId,
    ModelInfo,
    mainlandQwenDefaultModelId,
    mainlandQwenModels,
    QwenApiRegions,
} from "@shared/api"
import OpenAI from "openai"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { DiracStorageMessage } from "@/shared/messages/content"
import { createOpenAIClient } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import { ApiHandler, CommonApiHandlerOptions } from "../"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { formatOpenAiCompatibleUsage } from "../transform/openai-usage"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

interface QwenHandlerOptions extends CommonApiHandlerOptions {
	qwenApiKey?: string
	qwenApiLine?: QwenApiRegions
	apiModelId?: string
	thinkingBudgetTokens?: number
}

export class QwenHandler implements ApiHandler {
	private options: QwenHandlerOptions
	private client: OpenAI | undefined

	constructor(options: QwenHandlerOptions) {
		// Ensure options start with defaults but allow overrides
		this.options = {
			qwenApiLine: QwenApiRegions.CHINA,
			...options,
		}
	}

	private useChinaApi(): boolean {
		return this.options.qwenApiLine === QwenApiRegions.CHINA
	}

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.qwenApiKey) {
				throw new Error("Alibaba API key is required")
			}
			try {
				this.client = createOpenAIClient({
					baseURL: this.useChinaApi()
						? "https://dashscope.aliyuncs.com/compatible-mode/v1"
						: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
					apiKey: this.options.qwenApiKey,
				})
			} catch (error: any) {
				throw new Error(`Error creating Alibaba client: ${error.message}`)
			}
		}
		return this.client
	}

	getModel(): { id: MainlandQwenModelId | InternationalQwenModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		// Branch based on API line to let poor typescript know what to do
		if (this.useChinaApi()) {
			const id = modelId && modelId in mainlandQwenModels ? (modelId as MainlandQwenModelId) : mainlandQwenDefaultModelId
			return {
				id,
				info: { ...(mainlandQwenModels[id] as ModelInfo), preserveThinking: (mainlandQwenModels[id] as ModelInfo).preserveThinking ?? (id.includes("deepseek") || (id.includes("qwen3") && (this.options.thinkingBudgetTokens || 0) !== 0) ? "all" : "off") },
			}
		}
		const id =
			modelId && modelId in internationalQwenModels
				? (modelId as InternationalQwenModelId)
				: internationalQwenDefaultModelId
		return {
			id,
			info: { ...(internationalQwenModels[id] as ModelInfo), preserveThinking: (internationalQwenModels[id] as ModelInfo).preserveThinking ?? (id.includes("deepseek") || (id.includes("qwen3") && (this.options.thinkingBudgetTokens || 0) !== 0) ? "all" : "off") },
		}
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: DiracStorageMessage[], tools?: OpenAITool[]): ApiStream {
		const client = this.ensureClient()
		const model = this.getModel()
		const isDeepseek = model.id.includes("deepseek")
		const isReasoningModelFamily = model.id.includes("qwen3") || ["qwen-plus-latest", "qwen-turbo-latest"].includes(model.id)

		const budgetTokens = this.options.thinkingBudgetTokens || 0
		const reasoningOn = budgetTokens !== 0
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

		let temperature: number | undefined = 0
		// Configuration for extended thinking
		const thinkingArgs = isReasoningModelFamily
			? {
					enable_thinking: reasoningOn,
					thinking_budget: reasoningOn ? budgetTokens : undefined,
				}
			: undefined

		if (isDeepseek || (reasoningOn && isReasoningModelFamily)) {
			temperature = undefined
		}

		const stream = await client.chat.completions.create({
			model: model.id,
			max_completion_tokens: model.info.maxTokens,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },
			temperature,
			...thinkingArgs,
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
				try {
					yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls)
				} catch (error) {
					Logger.error("Error processing tool call delta:", error, delta.tool_calls)
				}
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
}
