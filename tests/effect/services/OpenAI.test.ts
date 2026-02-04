/**
 * Tests for the Effect-TS OpenAI service.
 */

import { describe, expect, test } from "bun:test";
import { Effect, Exit, Cause, Chunk } from "effect";
import {
	OpenAI,
	makeOpenAITestLayer,
} from "../../../src/effect/services/OpenAI";
import OpenAIClient from "openai";

/**
 * Helper to extract the original error message from an Effect failure.
 * Effect.tryPromise wraps errors in UnknownException which has an `error` property.
 */
function extractErrorMessage(cause: Cause.Cause<unknown>): string {
	const failuresChunk = Cause.failures(cause);
	const failures = Chunk.toArray(failuresChunk);
	if (failures.length > 0) {
		const error = failures[0];
		// UnknownException wraps the original error in .error property
		if (error && typeof error === "object" && "error" in error) {
			const wrapped = (error as { error: unknown }).error;
			if (wrapped instanceof Error) {
				return wrapped.message;
			}
			return String(wrapped);
		}
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	}
	// Try to get defects (unexpected errors)
	const defectsChunk = Cause.defects(cause);
	const defects = Chunk.toArray(defectsChunk);
	if (defects.length > 0) {
		const error = defects[0];
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	}
	return String(cause);
}

describe("OpenAI Effect Service", () => {
	describe("OpenAI.Test layer", () => {
		test("provides access to mock client", async () => {
			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				return client;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(OpenAI.Test)),
			);

			// The mock client should be truthy
			expect(result).toBeTruthy();
		});

		test("mock client throws helpful error when method called without mock", async () => {
			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				// Wrap the async call in Effect.tryPromise
				return yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [],
					}),
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(OpenAI.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const errorMessage = extractErrorMessage(exit.cause);
				expect(errorMessage).toContain("was called but not mocked");
				expect(errorMessage).toContain("makeOpenAITestLayer");
			}
		});

		test("mock client throws for nested property access", async () => {
			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				// Wrap the async call in Effect.tryPromise
				return yield* Effect.tryPromise(() =>
					client.audio.transcriptions.create({
						// Using a string as file causes a type error, but the mock doesn't care
						file: "test.mp3" as unknown as File,
						model: "whisper-1",
					}),
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(OpenAI.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const errorMessage = extractErrorMessage(exit.cause);
				expect(errorMessage).toContain("was called but not mocked");
			}
		});
	});

	describe("makeOpenAITestLayer factory", () => {
		test("allows mocking chat completions", async () => {
			const mockResponse = {
				id: "mock-completion-id",
				object: "chat.completion" as const,
				created: Date.now(),
				model: "gpt-4o",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant" as const,
							content: "This is a mocked response",
						},
						logprobs: null,
						finish_reason: "stop" as const,
					},
				],
			};

			const testLayer = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async () => mockResponse,
					},
				},
			});

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				const response = yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [{ role: "user", content: "Hello" }],
					}),
				);
				return response;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.id).toBe("mock-completion-id");
			expect(result.choices[0]?.message.content).toBe(
				"This is a mocked response",
			);
		});

		test("allows mocking audio transcriptions", async () => {
			const mockTranscription = {
				text: "This is a mocked transcription of the audio file.",
				language: "en",
				duration: 120.5,
				segments: [
					{ id: 0, start: 0, end: 5, text: "This is a mocked" },
					{ id: 1, start: 5, end: 10, text: "transcription of the audio file." },
				],
			};

			const testLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockTranscription,
					},
				},
			});

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				const response = yield* Effect.tryPromise(() =>
					client.audio.transcriptions.create({
						file: {} as File,
						model: "whisper-1",
						response_format: "verbose_json",
					}),
				);
				return response;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.text).toBe(
				"This is a mocked transcription of the audio file.",
			);
			expect(result.language).toBe("en");
			expect(result.duration).toBe(120.5);
		});

		test("unmocked methods still throw helpful errors", async () => {
			// Only mock chat.completions, not audio.transcriptions
			const testLayer = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async () => ({
							id: "mock",
							object: "chat.completion" as const,
							created: Date.now(),
							model: "gpt-4o",
							choices: [],
						}),
					},
				},
			});

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				return yield* Effect.tryPromise(() =>
					client.audio.transcriptions.create({
						file: "test.mp3" as unknown as File,
						model: "whisper-1",
					}),
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const errorMessage = extractErrorMessage(exit.cause);
				expect(errorMessage).toContain("was called but not mocked");
			}
		});

		test("mock tracks call arguments", async () => {
			let capturedArgs: unknown;

			const testLayer = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async (args: unknown) => {
							capturedArgs = args;
							return {
								id: "mock",
								object: "chat.completion" as const,
								created: Date.now(),
								model: "gpt-4o",
								choices: [],
							};
						},
					},
				},
			});

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [
							{ role: "system", content: "You are a helpful assistant." },
							{ role: "user", content: "What is 2+2?" },
						],
						temperature: 0.7,
					}),
				);
			});

			await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

			expect(capturedArgs).toBeDefined();
			const args = capturedArgs as {
				model: string;
				messages: unknown[];
				temperature: number;
			};
			expect(args.model).toBe("gpt-4o");
			expect(args.messages).toHaveLength(2);
			expect(args.temperature).toBe(0.7);
		});

		test("mock can simulate errors", async () => {
			const testLayer = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async () => {
							throw new Error("Rate limit exceeded");
						},
					},
				},
			});

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [],
					}),
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const errorMessage = extractErrorMessage(exit.cause);
				expect(errorMessage).toContain("Rate limit exceeded");
			}
		});
	});

	describe("OpenAI.Live layer", () => {
		test("fails with ConfigError when OPENAI_API_KEY not set", async () => {
			// Save and clear the env var
			const originalKey = process.env.OPENAI_API_KEY;
			delete process.env.OPENAI_API_KEY;

			try {
				const program = Effect.gen(function* () {
					const { client } = yield* OpenAI;
					return client;
				});

				const exit = await Effect.runPromiseExit(
					program.pipe(Effect.provide(OpenAI.Live)),
				);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					// The error should be a ConfigError for missing OPENAI_API_KEY
					const error = exit.cause;
					expect(String(error)).toContain("OPENAI_API_KEY");
				}
			} finally {
				// Restore the env var
				if (originalKey !== undefined) {
					process.env.OPENAI_API_KEY = originalKey;
				}
			}
		});

		test("creates client when OPENAI_API_KEY is set", async () => {
			// Skip if no API key is set (CI environment)
			const apiKey = process.env.OPENAI_API_KEY;
			if (!apiKey) {
				console.log("Skipping live client test: OPENAI_API_KEY not set");
				return;
			}

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				// Verify it's a real OpenAI client instance
				return client instanceof OpenAIClient;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(OpenAI.Live)),
			);

			expect(result).toBe(true);
		});
	});

	describe("service isolation", () => {
		test("each test layer is independent", async () => {
			const layer1 = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async () => ({
							id: "layer1",
							object: "chat.completion" as const,
							created: Date.now(),
							model: "gpt-4o",
							choices: [
								{
									index: 0,
									message: {
										role: "assistant" as const,
										content: "Response from layer 1",
									},
									logprobs: null,
									finish_reason: "stop" as const,
								},
							],
						}),
					},
				},
			});

			const layer2 = makeOpenAITestLayer({
				chat: {
					completions: {
						create: async () => ({
							id: "layer2",
							object: "chat.completion" as const,
							created: Date.now(),
							model: "gpt-4o",
							choices: [
								{
									index: 0,
									message: {
										role: "assistant" as const,
										content: "Response from layer 2",
									},
									logprobs: null,
									finish_reason: "stop" as const,
								},
							],
						}),
					},
				},
			});

			const program = Effect.gen(function* () {
				const { client } = yield* OpenAI;
				const response = yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [],
					}),
				);
				return response.choices[0]?.message.content;
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
