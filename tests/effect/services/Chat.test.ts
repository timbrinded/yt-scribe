/**
 * Tests for the Effect-TS Chat service.
 *
 * This service has a dependency on the OpenAI service, demonstrating
 * the Effect-TS DI pattern for service composition and testing.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Exit, Layer, Stream, Chunk } from "effect";
import { Chat, makeChatTestLayer } from "../../../src/effect/services/Chat";
import { makeOpenAITestLayer } from "../../../src/effect/services/OpenAI";
import { ChatApiError } from "../../../src/effect/errors";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockTranscript =
	"This is a test transcript. It talks about various topics.";
const mockMessages = [
	{ role: "user" as const, content: "What is this video about?" },
	{ role: "assistant" as const, content: "This video is about various topics." },
];

/**
 * Creates a mock async iterable stream for OpenAI streaming responses.
 */
function createMockAsyncIterableStream(chunks: string[]) {
	let index = 0;
	return {
		[Symbol.asyncIterator]() {
			return {
				async next() {
					if (index >= chunks.length) {
						return { done: true, value: undefined };
					}
					const chunk = chunks[index++];
					return {
						done: false,
						value: { choices: [{ delta: { content: chunk } }] },
					};
				},
			};
		},
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("Chat Effect Service", () => {
	describe("Chat.Test layer", () => {
		it.effect("chat returns helpful error message indicating mock needed", () =>
			Effect.gen(function* () {
				const chat = yield* Chat;
				const exit = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("not mocked");
						expect(error.reason).toContain("makeChatTestLayer");
					}
				}
			}).pipe(Effect.provide(Chat.Test)),
		);

		it.effect("chatComplete returns helpful error message indicating mock needed", () =>
			Effect.gen(function* () {
				const chat = yield* Chat;
				const exit = yield* chat.chatComplete(mockTranscript, [], "Hello").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("not mocked");
						expect(error.reason).toContain("makeChatTestLayer");
					}
				}
			}).pipe(Effect.provide(Chat.Test)),
		);
	});

	describe("makeChatTestLayer factory", () => {
		it.effect("allows mocking chatComplete response", () =>
			Effect.gen(function* () {
				const testLayer = makeChatTestLayer({
					chatComplete: () =>
						Effect.succeed("This is a mocked response from the AI."),
				});

				const chat = yield* Effect.provide(Chat, testLayer);
				const result = yield* chat.chatComplete(
					mockTranscript,
					[],
					"What is this about?",
				);

				expect(result).toBe("This is a mocked response from the AI.");
			}),
		);

		it.effect("allows mocking chat stream", () =>
			Effect.gen(function* () {
				const testLayer = makeChatTestLayer({
					chat: () => Stream.fromIterable(["Hello ", "world", "!"]),
				});

				const chat = yield* Effect.provide(Chat, testLayer);
				const chunks = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Greet me"),
				);
				const result = Chunk.toArray(chunks).join("");

				expect(result).toBe("Hello world!");
			}),
		);

		it.effect("allows mocking chat errors", () =>
			Effect.gen(function* () {
				const testLayer = makeChatTestLayer({
					chatComplete: () =>
						Effect.fail(
							new ChatApiError({
								reason: "Custom error: service unavailable",
								retryable: true,
							}),
						),
				});

				const chat = yield* Effect.provide(Chat, testLayer);
				const exit = yield* chat.chatComplete(mockTranscript, [], "Hello").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toBe("Custom error: service unavailable");
						expect(error.retryable).toBe(true);
					}
				}
			}),
		);

		it.effect("tracks arguments passed to chatComplete", () =>
			Effect.gen(function* () {
				const capturedCalls: Array<{
					transcript: string;
					messages: ReadonlyArray<{ role: string; content: string }>;
					userMessage: string;
					videoTitle?: string;
				}> = [];

				const testLayer = makeChatTestLayer({
					chatComplete: (transcript, messages, userMessage, videoTitle) => {
						capturedCalls.push({
							transcript,
							messages,
							userMessage,
							videoTitle,
						});
						return Effect.succeed("Response");
					},
				});

				const chat = yield* Effect.provide(Chat, testLayer);
				yield* chat.chatComplete(
					"Test transcript",
					mockMessages,
					"New question",
					"Video Title",
				);

				expect(capturedCalls).toHaveLength(1);
				expect(capturedCalls[0]?.transcript).toBe("Test transcript");
				expect(capturedCalls[0]?.messages).toHaveLength(2);
				expect(capturedCalls[0]?.userMessage).toBe("New question");
				expect(capturedCalls[0]?.videoTitle).toBe("Video Title");
			}),
		);

		it.effect("unmocked methods still fail appropriately", () =>
			Effect.gen(function* () {
				// Only mock chatComplete, not chat
				const testLayer = makeChatTestLayer({
					chatComplete: () => Effect.succeed("Mocked"),
				});

				const chat = yield* Effect.provide(Chat, testLayer);
				const exit = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("not mocked");
					}
				}
			}),
		);
	});

	describe("Chat.Live layer with mocked OpenAI", () => {
		it.effect("chatComplete returns full response from streamed chunks", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () =>
								createMockAsyncIterableStream([
									"This ",
									"is ",
									"a ",
									"test ",
									"response.",
								]),
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const result = yield* chat.chatComplete(
					mockTranscript,
					[],
					"What is this about?",
				);

				expect(result).toBe("This is a test response.");
			}),
		);

		it.effect("chat streams chunks correctly", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () =>
								createMockAsyncIterableStream(["Hello", " ", "world!"]),
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const chunks = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				);
				const result = Chunk.toArray(chunks);

				expect(result).toEqual(["Hello", " ", "world!"]);
			}),
		);

		it.effect("includes previous messages in API call", () =>
			Effect.gen(function* () {
				let capturedMessages: unknown[] = [];

				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async (params: { messages?: unknown[] }) => {
								capturedMessages = params.messages ?? [];
								return createMockAsyncIterableStream(["Response"]);
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				yield* chat.chatComplete(
					mockTranscript,
					mockMessages,
					"New question",
				);

				// Should have: system prompt, 2 previous messages, new user message
				expect(capturedMessages.length).toBe(4);
				expect((capturedMessages[0] as { role: string }).role).toBe("system");
				expect((capturedMessages[1] as { role: string }).role).toBe("user");
				expect((capturedMessages[2] as { role: string }).role).toBe("assistant");
				expect((capturedMessages[3] as { role: string }).role).toBe("user");
				expect((capturedMessages[3] as { content: string }).content).toBe(
					"New question",
				);
			}),
		);

		it.effect("includes video title in system prompt when provided", () =>
			Effect.gen(function* () {
				let capturedMessages: Array<{ role: string; content: string }> = [];

				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async (params: {
								messages?: Array<{ role: string; content: string }>;
							}) => {
								capturedMessages = params.messages ?? [];
								return createMockAsyncIterableStream(["Response"]);
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				yield* chat.chatComplete(
					mockTranscript,
					[],
					"Question",
					"My Video Title",
				);

				const systemPrompt = capturedMessages[0]?.content ?? "";
				expect(systemPrompt).toContain("My Video Title");
			}),
		);

		it.effect("includes transcript in system prompt", () =>
			Effect.gen(function* () {
				let capturedMessages: Array<{ role: string; content: string }> = [];

				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async (params: {
								messages?: Array<{ role: string; content: string }>;
							}) => {
								capturedMessages = params.messages ?? [];
								return createMockAsyncIterableStream(["Response"]);
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				yield* chat.chatComplete(
					"This is the unique transcript content.",
					[],
					"Question",
				);

				const systemPrompt = capturedMessages[0]?.content ?? "";
				expect(systemPrompt).toContain("This is the unique transcript content.");
			}),
		);

		it.effect("maps OpenAI 401 error to ChatApiError", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () => {
								throw { status: 401, message: "Invalid API key" };
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const exit = yield* chat.chatComplete(mockTranscript, [], "Hello").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("Invalid OpenAI API key");
						expect(error.retryable).toBe(false);
					}
				}
			}),
		);

		it.effect("maps OpenAI 429 error to ChatApiError with retryable true", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () => {
								throw { status: 429, message: "Rate limit exceeded" };
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const exit = yield* chat.chatComplete(mockTranscript, [], "Hello").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("rate limit");
						expect(error.retryable).toBe(true);
					}
				}
			}),
		);

		it.effect("maps context length error to ChatApiError", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () => {
								throw {
									status: 400,
									message: "This model's context length is exceeded",
								};
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const exit = yield* chat.chatComplete(mockTranscript, [], "Hello").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("too long");
						expect(error.retryable).toBe(false);
					}
				}
			}),
		);

		it.effect("maps generic OpenAI error to ChatApiError", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () => {
								throw { status: 500, message: "Internal server error" };
							},
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const exit = yield* chat.chatComplete(mockTranscript, [], "Hello").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(ChatApiError);
					if (error instanceof ChatApiError) {
						expect(error.reason).toContain("OpenAI API error");
						expect(error.retryable).toBe(false);
					}
				}
			}),
		);

		it.effect("handles chunks with empty content", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () =>
								createMockAsyncIterableStream([
									"Hello",
									"", // Empty chunk
									" world",
									undefined as unknown as string, // Undefined content
									"!",
								]),
						},
					},
				});

				const testLayer = Layer.provide(Chat.Live, openAITestLayer);

				const chat = yield* Effect.provide(Chat, testLayer);
				const chunks = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				);
				const result = Chunk.toArray(chunks).join("");

				// Only non-empty chunks should be included
				expect(result).toBe("Hello world!");
			}),
		);
	});

	describe("service isolation", () => {
		it.effect("each test layer is independent", () =>
			Effect.gen(function* () {
				const layer1 = makeChatTestLayer({
					chatComplete: () => Effect.succeed("Response from layer 1"),
				});

				const layer2 = makeChatTestLayer({
					chatComplete: () => Effect.succeed("Response from layer 2"),
				});

				const program = Effect.gen(function* () {
					const chat = yield* Chat;
					return yield* chat.chatComplete(mockTranscript, [], "Hello");
				});

				const result1 = yield* program.pipe(Effect.provide(layer1));
				const result2 = yield* program.pipe(Effect.provide(layer2));

				expect(result1).toBe("Response from layer 1");
				expect(result2).toBe("Response from layer 2");
			}),
		);
	});
});
