/**
 * Tests for the Effect-TS OpenAI service.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
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
		it.effect("provides access to mock client", () =>
			Effect.gen(function* () {
				const { client } = yield* OpenAI;
				// The mock client should be truthy
				expect(client).toBeTruthy();
			}).pipe(Effect.provide(OpenAI.Test)),
		);

		it.effect(
			"mock client throws helpful error when method called without mock",
			() =>
				Effect.gen(function* () {
					const { client } = yield* OpenAI;
					// Wrap the async call in Effect.tryPromise
					const exit = yield* Effect.tryPromise(() =>
						client.chat.completions.create({
							model: "gpt-4o",
							messages: [],
						}),
					).pipe(Effect.exit);

					expect(Exit.isFailure(exit)).toBe(true);
					if (Exit.isFailure(exit)) {
						const errorMessage = extractErrorMessage(exit.cause);
						expect(errorMessage).toContain("was called but not mocked");
						expect(errorMessage).toContain("makeOpenAITestLayer");
					}
				}).pipe(Effect.provide(OpenAI.Test)),
		);

		it.effect("mock client throws for nested property access", () =>
			Effect.gen(function* () {
				const { client } = yield* OpenAI;
				// Wrap the async call in Effect.tryPromise
				const exit = yield* Effect.tryPromise(() =>
					client.audio.transcriptions.create({
						// Using a string as file causes a type error, but the mock doesn't care
						file: "test.mp3" as unknown as File,
						model: "whisper-1",
					}),
				).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const errorMessage = extractErrorMessage(exit.cause);
					expect(errorMessage).toContain("was called but not mocked");
				}
			}).pipe(Effect.provide(OpenAI.Test)),
		);
	});

	describe("makeOpenAITestLayer factory", () => {
		it.effect("allows mocking chat completions", () =>
			Effect.gen(function* () {
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

				const { client } = yield* Effect.provide(OpenAI, testLayer);
				const response = yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [{ role: "user", content: "Hello" }],
					}),
				);

				expect(response.id).toBe("mock-completion-id");
				expect(response.choices[0]?.message.content).toBe(
					"This is a mocked response",
				);
			}),
		);

		it.effect("allows mocking audio transcriptions", () =>
			Effect.gen(function* () {
				const mockTranscription = {
					text: "This is a mocked transcription of the audio file.",
					language: "en",
					duration: 120.5,
					segments: [
						{ id: 0, start: 0, end: 5, text: "This is a mocked" },
						{
							id: 1,
							start: 5,
							end: 10,
							text: "transcription of the audio file.",
						},
					],
				};

				const testLayer = makeOpenAITestLayer({
					audio: {
						transcriptions: {
							create: async () => mockTranscription,
						},
					},
				});

				const { client } = yield* Effect.provide(OpenAI, testLayer);
				const response = yield* Effect.tryPromise(() =>
					client.audio.transcriptions.create({
						file: {} as File,
						model: "whisper-1",
						response_format: "verbose_json",
					}),
				);

				expect(response.text).toBe(
					"This is a mocked transcription of the audio file.",
				);
				expect(response.language).toBe("en");
				expect(response.duration).toBe(120.5);
			}),
		);

		it.effect("unmocked methods still throw helpful errors", () =>
			Effect.gen(function* () {
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

				const { client } = yield* Effect.provide(OpenAI, testLayer);
				const exit = yield* Effect.tryPromise(() =>
					client.audio.transcriptions.create({
						file: "test.mp3" as unknown as File,
						model: "whisper-1",
					}),
				).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const errorMessage = extractErrorMessage(exit.cause);
					expect(errorMessage).toContain("was called but not mocked");
				}
			}),
		);

		it.effect("mock tracks call arguments", () =>
			Effect.gen(function* () {
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

				const { client } = yield* Effect.provide(OpenAI, testLayer);
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

				expect(capturedArgs).toBeDefined();
				const args = capturedArgs as {
					model: string;
					messages: unknown[];
					temperature: number;
				};
				expect(args.model).toBe("gpt-4o");
				expect(args.messages).toHaveLength(2);
				expect(args.temperature).toBe(0.7);
			}),
		);

		it.effect("mock can simulate errors", () =>
			Effect.gen(function* () {
				const testLayer = makeOpenAITestLayer({
					chat: {
						completions: {
							create: async () => {
								throw new Error("Rate limit exceeded");
							},
						},
					},
				});

				const { client } = yield* Effect.provide(OpenAI, testLayer);
				const exit = yield* Effect.tryPromise(() =>
					client.chat.completions.create({
						model: "gpt-4o",
						messages: [],
					}),
				).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const errorMessage = extractErrorMessage(exit.cause);
					expect(errorMessage).toContain("Rate limit exceeded");
				}
			}),
		);
	});

	describe("OpenAI.Live layer", () => {
		it.effect("fails with ConfigError when OPENAI_API_KEY not set", () =>
			Effect.gen(function* () {
				// Save and clear the env var
				const originalKey = process.env.OPENAI_API_KEY;
				delete process.env.OPENAI_API_KEY;

				try {
					const exit = yield* Effect.gen(function* () {
						const { client } = yield* OpenAI;
						return client;
					}).pipe(Effect.provide(OpenAI.Live), Effect.exit);

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
			}),
		);

		it.effect("creates client when OPENAI_API_KEY is set", () =>
			Effect.gen(function* () {
				// Skip if no API key is set (CI environment)
				const apiKey = process.env.OPENAI_API_KEY;
				if (!apiKey) {
					console.log("Skipping live client test: OPENAI_API_KEY not set");
					return;
				}

				const { client } = yield* Effect.provide(OpenAI, OpenAI.Live);
				// Verify it's a real OpenAI client instance
				expect(client instanceof OpenAIClient).toBe(true);
			}),
		);
	});

	describe("service isolation", () => {
		it.effect("each test layer is independent", () =>
			Effect.gen(function* () {
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

				const result1 = yield* program.pipe(Effect.provide(layer1));
				const result2 = yield* program.pipe(Effect.provide(layer2));

				expect(result1).toBe("Response from layer 1");
				expect(result2).toBe("Response from layer 2");
			}),
		);
	});
});
