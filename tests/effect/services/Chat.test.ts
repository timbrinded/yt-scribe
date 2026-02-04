/**
 * Tests for the Effect-TS Chat service.
 *
 * This service has a dependency on the OpenAI service, demonstrating
 * the Effect-TS DI pattern for service composition and testing.
 */

import { describe, expect, test } from "bun:test";
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
		test("chat returns helpful error message indicating mock needed", async () => {
			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Chat.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("not mocked");
					expect(error.reason).toContain("makeChatTestLayer");
				}
			}
		});

		test("chatComplete returns helpful error message indicating mock needed", async () => {
			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(mockTranscript, [], "Hello");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Chat.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("not mocked");
					expect(error.reason).toContain("makeChatTestLayer");
				}
			}
		});
	});

	describe("makeChatTestLayer factory", () => {
		test("allows mocking chatComplete response", async () => {
			const testLayer = makeChatTestLayer({
				chatComplete: () =>
					Effect.succeed("This is a mocked response from the AI."),
			});

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(
					mockTranscript,
					[],
					"What is this about?",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toBe("This is a mocked response from the AI.");
		});

		test("allows mocking chat stream", async () => {
			const testLayer = makeChatTestLayer({
				chat: () => Stream.fromIterable(["Hello ", "world", "!"]),
			});

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				const chunks = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Greet me"),
				);
				return Chunk.toArray(chunks).join("");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toBe("Hello world!");
		});

		test("allows mocking chat errors", async () => {
			const testLayer = makeChatTestLayer({
				chatComplete: () =>
					Effect.fail(
						new ChatApiError({
							reason: "Custom error: service unavailable",
							retryable: true,
						}),
					),
			});

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(mockTranscript, [], "Hello");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toBe("Custom error: service unavailable");
					expect(error.retryable).toBe(true);
				}
			}
		});

		test("tracks arguments passed to chatComplete", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(
					"Test transcript",
					mockMessages,
					"New question",
					"Video Title",
				);
			});

			await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

			expect(capturedCalls).toHaveLength(1);
			expect(capturedCalls[0]?.transcript).toBe("Test transcript");
			expect(capturedCalls[0]?.messages).toHaveLength(2);
			expect(capturedCalls[0]?.userMessage).toBe("New question");
			expect(capturedCalls[0]?.videoTitle).toBe("Video Title");
		});

		test("unmocked methods still fail appropriately", async () => {
			// Only mock chatComplete, not chat
			const testLayer = makeChatTestLayer({
				chatComplete: () => Effect.succeed("Mocked"),
			});

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("not mocked");
				}
			}
		});
	});

	describe("Chat.Live layer with mocked OpenAI", () => {
		test("chatComplete returns full response from streamed chunks", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(
					mockTranscript,
					[],
					"What is this about?",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toBe("This is a test response.");
		});

		test("chat streams chunks correctly", async () => {
			const openAITestLayer = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async () =>
							createMockAsyncIterableStream(["Hello", " ", "world!"]),
					},
				},
			});

			const testLayer = Layer.provide(Chat.Live, openAITestLayer);

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				const chunks = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				);
				return Chunk.toArray(chunks);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toEqual(["Hello", " ", "world!"]);
		});

		test("includes previous messages in API call", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(
					mockTranscript,
					mockMessages,
					"New question",
				);
			});

			await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

			// Should have: system prompt, 2 previous messages, new user message
			expect(capturedMessages.length).toBe(4);
			expect((capturedMessages[0] as { role: string }).role).toBe("system");
			expect((capturedMessages[1] as { role: string }).role).toBe("user");
			expect((capturedMessages[2] as { role: string }).role).toBe("assistant");
			expect((capturedMessages[3] as { role: string }).role).toBe("user");
			expect((capturedMessages[3] as { content: string }).content).toBe(
				"New question",
			);
		});

		test("includes video title in system prompt when provided", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(
					mockTranscript,
					[],
					"Question",
					"My Video Title",
				);
			});

			await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

			const systemPrompt = capturedMessages[0]?.content ?? "";
			expect(systemPrompt).toContain("My Video Title");
		});

		test("includes transcript in system prompt", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(
					"This is the unique transcript content.",
					[],
					"Question",
				);
			});

			await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

			const systemPrompt = capturedMessages[0]?.content ?? "";
			expect(systemPrompt).toContain("This is the unique transcript content.");
		});

		test("maps OpenAI 401 error to ChatApiError", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(mockTranscript, [], "Hello");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("Invalid OpenAI API key");
					expect(error.retryable).toBe(false);
				}
			}
		});

		test("maps OpenAI 429 error to ChatApiError with retryable true", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(mockTranscript, [], "Hello");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("rate limit");
					expect(error.retryable).toBe(true);
				}
			}
		});

		test("maps context length error to ChatApiError", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(mockTranscript, [], "Hello");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("too long");
					expect(error.retryable).toBe(false);
				}
			}
		});

		test("maps generic OpenAI error to ChatApiError", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				return yield* chat.chatComplete(mockTranscript, [], "Hello");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(ChatApiError);
				if (error instanceof ChatApiError) {
					expect(error.reason).toContain("OpenAI API error");
					expect(error.retryable).toBe(false);
				}
			}
		});

		test("handles chunks with empty content", async () => {
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

			const program = Effect.gen(function* () {
				const chat = yield* Chat;
				const chunks = yield* Stream.runCollect(
					chat.chat(mockTranscript, [], "Hello"),
				);
				return Chunk.toArray(chunks).join("");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			// Only non-empty chunks should be included
			expect(result).toBe("Hello world!");
		});
	});

	describe("service isolation", () => {
		test("each test layer is independent", async () => {
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

			const result1 = await Effect.runPromise(
				program.pipe(Effect.provide(layer1)),
			);
			const result2 = await Effect.runPromise(
				program.pipe(Effect.provide(layer2)),
			);

			expect(result1).toBe("Response from layer 1");
			expect(result2).toBe("Response from layer 2");
		});
	});
});
