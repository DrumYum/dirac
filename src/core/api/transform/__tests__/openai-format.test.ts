import "should"
import { LegacyResponseParameter, LegacyResponseTool } from "@shared/responseTool"
import { convertToOpenAiMessages } from "../openai-format"

// Characterization tests for convertToOpenAiMessages.
// Covers: string content, array user content (text, image, tool_result),
// assistant content (text, thinking, tool_use, reasoning_details),
// image base64/url sources, supportsImages flag, tool call ID transformation.
describe("convertToOpenAiMessages", () => {
	describe("string content", () => {
		it("passes through string content with role", () => {
			const result = convertToOpenAiMessages([{ role: "user", content: "hello" }])
			result.should.deepEqual([{ role: "user", content: "hello" }])
		})

		it("passes through assistant string content", () => {
			const result = convertToOpenAiMessages([{ role: "assistant", content: "hi there" }])
			result.should.deepEqual([{ role: "assistant", content: "hi there" }])
		})
	})

	describe("user array content", () => {
		it("converts text blocks to user message", () => {
			const result = convertToOpenAiMessages([{ role: "user", content: [{ type: "text", text: "hello world" }] }])
			result.should.have.length(1)
			result[0].role.should.equal("user")
			;(result[0] as any).content.should.deepEqual([{ type: "text", text: "hello world" }])
		})

		it("converts base64 image blocks to image_url when supportsImages=true", () => {
			const result = convertToOpenAiMessages(
				[
					{
						role: "user",
						content: [
							{
								type: "image",
								source: { type: "base64", media_type: "image/png", data: "abc123" },
							},
						],
					},
				],
				undefined,
				true,
			)
			result.should.have.length(1)
			;(result[0] as any).content[0].should.deepEqual({
				type: "image_url",
				image_url: { url: "data:image/png;base64,abc123" },
			})
		})

		it("converts url image blocks to image_url when supportsImages=true", () => {
			const result = convertToOpenAiMessages(
				[
					{
						role: "user",
						content: [
							{
								type: "image",
								source: { type: "url", url: "https://example.com/img.png" } as any,
							},
						],
					},
				],
				undefined,
				true,
			)
			;(result[0] as any).content[0].should.deepEqual({
				type: "image_url",
				image_url: { url: "https://example.com/img.png" },
			})
		})

		it("replaces image with [Image] text when supportsImages=false", () => {
			const result = convertToOpenAiMessages(
				[
					{
						role: "user",
						content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } }],
					},
				],
				undefined,
				false,
			)
			;(result[0] as any).content[0].should.deepEqual({ type: "text", text: "[Image]" })
		})

		it("converts tool_result with string content to tool message", () => {
			const result = convertToOpenAiMessages([
				{
					role: "user",
					content: [{ type: "tool_result", tool_use_id: "tool_123", content: "result text" }],
				},
			])
			result.should.deepEqual([{ role: "tool", tool_call_id: "tool_123", content: "result text" }])
		})

		it("converts tool_result with array content, extracting text and deferring images", () => {
			const result = convertToOpenAiMessages(
				[
					{
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: "tool_456",
								content: [
									{ type: "text", text: "output" },
									{ type: "image", source: { type: "base64", media_type: "image/png", data: "img" } },
								],
							},
						],
					},
				],
				undefined,
				true,
			)
			// tool message with text content, then separate user message with image
			result.should.have.length(2)
			result[0].should.deepEqual({
				role: "tool",
				tool_call_id: "tool_456",
				content: "output\n(see following user message for image)",
			})
			;(result[1] as any).role.should.equal("user")
			;(result[1] as any).content[0].type.should.equal("image_url")
		})

		it("emits tool messages before non-tool user messages", () => {
			const result = convertToOpenAiMessages([
				{
					role: "user",
					content: [
						{ type: "text", text: "after tool" },
						{ type: "tool_result", tool_use_id: "t1", content: "r1" },
					],
				},
			])
			result.should.have.length(2)
			result[0].should.deepEqual({ role: "tool", tool_call_id: "t1", content: "r1" })
			;(result[1] as any).role.should.equal("user")
		})
	})

	describe("assistant array content", () => {
		it("converts text blocks to assistant message with content", () => {
			const result = convertToOpenAiMessages([{ role: "assistant", content: [{ type: "text", text: "response" }] }])
			result.should.have.length(1)
			result[0].role.should.equal("assistant")
			;(result[0] as any).content.should.equal("response")
			should.equal((result[0] as any).tool_calls, undefined)
		})

		it("converts tool_use blocks to tool_calls", () => {
			const result = convertToOpenAiMessages([
				{
					role: "assistant",
					content: [{ type: "tool_use", id: "call_1", name: "get_weather", input: { city: "SF" } }],
				},
			])
			result.should.have.length(1)
			;(result[0] as any).tool_calls.should.deepEqual([
				{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"SF"}' } },
			])
		})

		it("preserves legacy response history names and tool-result correlation", () => {
			const result = convertToOpenAiMessages([
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "legacy-call",
							name: LegacyResponseTool.COMPLETE,
							input: { [LegacyResponseParameter.RESULT]: "Done" },
						},
					],
				},
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "legacy-call", content: "Accepted" }] },
			] as any)

			;(result[0] as any).tool_calls[0].function.name.should.equal(LegacyResponseTool.COMPLETE)
			;(result[1] as any).tool_call_id.should.equal((result[0] as any).tool_calls[0].id)
		})

		it("sets content to null when only tool_calls present", () => {
			const result = convertToOpenAiMessages([
				{
					role: "assistant",
					content: [{ type: "tool_use", id: "c1", name: "fn", input: {} }],
				},
			])
			should.equal((result[0] as any).content, null)
		})

		it("sets content to empty string when no text and no tool_calls", () => {
			const result = convertToOpenAiMessages([
				{ role: "assistant", content: [{ type: "thinking", thinking: "hmm", signature: "sig" }] },
			])
			;(result[0] as any).content.should.equal("")
		})

		it("preserves reasoning_details from text blocks", () => {
			const result = convertToOpenAiMessages([
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "answer",
							reasoning_details: [
								{ type: "reasoning.text", text: "because", format: "text", index: 0, signature: "sig" },
							],
						},
					],
				},
			])
			;(result[0] as any).reasoning_details.should.have.length(1)
			;(result[0] as any).reasoning_details[0].text.should.equal("because")
		})

		it("combines text and tool_use in same assistant message", () => {
			const result = convertToOpenAiMessages([
				{
					role: "assistant",
					content: [
						{ type: "text", text: "let me check" },
						{ type: "tool_use", id: "c2", name: "fn", input: {} },
					],
				},
			])
			result.should.have.length(1)
			;(result[0] as any).content.should.equal("let me check")
			;(result[0] as any).tool_calls.should.have.length(1)
		})
	})

	describe("tool call ID transformation", () => {
		it("transforms fc_ IDs to call_ format", () => {
			const fcId = "fc_" + "x".repeat(50) // 53 chars
			const result = convertToOpenAiMessages([
				{ role: "assistant", content: [{ type: "tool_use", id: fcId, name: "fn", input: {} }] },
			])
			const toolCallId = (result[0] as any).tool_calls[0].id
			toolCallId.should.startWith("call_")
			toolCallId.length.should.be.lessThanOrEqual(40)
		})

		it("truncates long IDs for openai-native provider", () => {
			const longId = "a".repeat(50)
			const result = convertToOpenAiMessages(
				[{ role: "assistant", content: [{ type: "tool_use", id: longId, name: "fn", input: {} }] }],
				"openai-native",
			)
			;(result[0] as any).tool_calls[0].id.should.have.length(40)
		})

		it("passes through non-fc_ IDs for non-openai-native provider", () => {
			const result = convertToOpenAiMessages([
				{ role: "assistant", content: [{ type: "tool_use", id: "tool_abc", name: "fn", input: {} }] },
			])
			;(result[0] as any).tool_calls[0].id.should.equal("tool_abc")
		})
	})
})
	describe("preserveThinking interleaved", () => {
		it("should add reasoning_content to assistant messages after the last real user message", () => {
			const result = convertToOpenAiMessages(
				[
					{ role: "user", content: [{ type: "text", text: "do something", isUserInput: true }] },
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "let me think", signature: "sig1" },
							{ type: "text", text: "working on it" },
						],
					},
				] as any,
				undefined,
				true,
				"interleaved",
			)
			;(result[1] as any).reasoning_content.should.equal("let me think")
		})

		it("should NOT add reasoning_content when preserveThinking is off", () => {
			const result = convertToOpenAiMessages(
				[
					{ role: "user", content: [{ type: "text", text: "do something", isUserInput: true }] },
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "let me think", signature: "sig1" },
							{ type: "text", text: "working on it" },
						],
					},
				] as any,
			)
			should.equal((result[1] as any).reasoning_content, undefined)
		})

		it("should NOT treat system-generated messages without isUserInput as real user messages", () => {
			// Simulates: user message -> assistant with thinking -> system message (no isUserInput) -> assistant with thinking
			const result = convertToOpenAiMessages(
				[
					{ role: "user", content: [{ type: "text", text: "do something", isUserInput: true }] },
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "first thinking", signature: "sig1" },
							{ type: "text", text: "first response" },
						],
					},
					{ role: "user", content: [{ type: "text", text: "[TASK RESUMPTION] resume..." }], isUserTurn: false } as any,
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "second thinking", signature: "sig2" },
							{ type: "text", text: "second response" },
						],
					},
				] as any,
				undefined,
				true,
				"interleaved",
			)
			// Both assistant messages should have reasoning_content because the system message is NOT a real user boundary
			;(result[1] as any).reasoning_content.should.equal("first thinking")
			;(result[3] as any).reasoning_content.should.equal("second thinking")
		})

		it("should reset reasoning_content after a real user message with isUserInput", () => {
			// Simulates: assistant with thinking -> real user message -> assistant with thinking
			const result = convertToOpenAiMessages(
				[
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "old thinking", signature: "sig1" },
							{ type: "text", text: "old response" },
						],
					},
					{ role: "user", content: [{ type: "text", text: "new instruction", isUserInput: true }] },
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "new thinking", signature: "sig2" },
							{ type: "text", text: "new response" },
						],
					},
				] as any,
				undefined,
				true,
				"interleaved",
			)
			// First assistant is BEFORE the real user message -> no reasoning_content
			should.equal((result[0] as any).reasoning_content, undefined)
			// Second assistant is AFTER -> should have reasoning_content
			;(result[2] as any).reasoning_content.should.equal("new thinking")
		})

		it("should NOT treat tool_result messages as real user messages", () => {
			const result = convertToOpenAiMessages(
				[
					{ role: "user", content: [{ type: "text", text: "do something", isUserInput: true }] },
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "first", signature: "sig1" },
							{ type: "tool_use", id: "c1", name: "fn", input: {} },
						],
					},
					{ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "done" }] },
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "second", signature: "sig2" },
							{ type: "text", text: "finished" },
						],
					},
				] as any,
				undefined,
				true,
				"interleaved",
			)
			// tool_result is not a real user boundary
			;(result[1] as any).reasoning_content.should.equal("first")
			;(result[3] as any).reasoning_content.should.equal("second")
		})
	})
