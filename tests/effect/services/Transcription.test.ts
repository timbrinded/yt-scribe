/**
 * Tests for the Effect-TS Transcription service.
 *
 * This service has a dependency on the OpenAI service, demonstrating
 * the Effect-TS DI pattern for service composition and testing.
 */

import { describe, expect, afterEach, it } from "vitest";
import { it as itEffect } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import {
	Transcription,
	makeTranscriptionTestLayer,
} from "../../../src/effect/services/Transcription";
import { makeOpenAITestLayer } from "../../../src/effect/services/OpenAI";
import { TranscriptionFailedError } from "../../../src/effect/errors";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a temporary test audio file.
 */
async function createTestAudioFile(
	extension = ".mp3",
	size = 1000,
): Promise<string> {
	const filePath = join(tmpdir(), `test-audio-${Date.now()}${extension}`);
	// Create a file with some content to simulate an audio file
	const content = Buffer.alloc(size, "x");
	await writeFile(filePath, content);
	return filePath;
}

/**
 * Mock Whisper transcription response.
 */
const mockWhisperResponse = {
	text: "This is a test transcription of the audio file.",
	language: "en",
	duration: 45.5,
	segments: [
		{ id: 0, start: 0, end: 5.2, text: "This is a test" },
		{ id: 1, start: 5.2, end: 10.8, text: "transcription of the" },
		{ id: 2, start: 10.8, end: 15.0, text: "audio file." },
	],
};

// =============================================================================
// Tests
// =============================================================================

describe("Transcription Effect Service", () => {
	describe("Transcription.Test layer", () => {
		itEffect.effect(
			"returns helpful error message indicating mock needed",
			() =>
				Effect.gen(function* () {
					const transcription = yield* Transcription;
					const exit = yield* transcription
						.transcribe("/path/to/audio.mp3")
						.pipe(Effect.exit);

					expect(Exit.isFailure(exit)).toBe(true);
					if (Exit.isFailure(exit)) {
						const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
						expect(error).toBeInstanceOf(TranscriptionFailedError);
						if (error instanceof TranscriptionFailedError) {
							expect(error.reason).toContain("not mocked");
							expect(error.reason).toContain("makeTranscriptionTestLayer");
						}
					}
				}).pipe(Effect.provide(Transcription.Test)),
		);
	});

	describe("makeTranscriptionTestLayer factory", () => {
		itEffect.effect("allows mocking transcription results", () =>
			Effect.gen(function* () {
				const mockResult = {
					text: "Mocked transcription",
					segments: [{ start: 0, end: 5, text: "Mocked transcription" }],
					language: "en",
					duration: 5,
				};

				const testLayer = makeTranscriptionTestLayer({
					transcribe: () => Effect.succeed(mockResult),
				});

				const transcription = yield* Effect.provide(Transcription, testLayer);
				const result = yield* transcription.transcribe("/any/path.mp3");

				expect(result.text).toBe("Mocked transcription");
				expect(result.segments).toHaveLength(1);
				expect(result.language).toBe("en");
				expect(result.duration).toBe(5);
			}),
		);

		itEffect.effect("allows mocking transcription errors", () =>
			Effect.gen(function* () {
				const testLayer = makeTranscriptionTestLayer({
					transcribe: () =>
						Effect.fail(
							new TranscriptionFailedError({
								videoId: 123,
								reason: "Custom error message",
							}),
						),
				});

				const transcription = yield* Effect.provide(Transcription, testLayer);
				const exit = yield* transcription
					.transcribe("/any/path.mp3")
					.pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(TranscriptionFailedError);
					if (error instanceof TranscriptionFailedError) {
						expect(error.videoId).toBe(123);
						expect(error.reason).toBe("Custom error message");
					}
				}
			}),
		);

		itEffect.effect("tracks file paths passed to transcribe", () =>
			Effect.gen(function* () {
				const capturedPaths: string[] = [];

				const testLayer = makeTranscriptionTestLayer({
					transcribe: (filePath) => {
						capturedPaths.push(filePath);
						return Effect.succeed({
							text: "Captured",
							segments: [],
							language: "en",
							duration: 0,
						});
					},
				});

				const transcription = yield* Effect.provide(Transcription, testLayer);
				yield* transcription.transcribe("/specific/path/audio.m4a");

				expect(capturedPaths).toHaveLength(1);
				expect(capturedPaths[0]).toBe("/specific/path/audio.m4a");
			}),
		);
	});

	describe("Transcription.Live layer with mocked OpenAI", () => {
		let testFilePath: string | null = null;

		afterEach(async () => {
			if (testFilePath) {
				await unlink(testFilePath).catch(() => {
					/* ignore */
				});
				testFilePath = null;
			}
		});

		it("successfully transcribes audio file with mocked Whisper", async () => {
			// Create a test audio file
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			// Create OpenAI mock layer with mocked Whisper
			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockWhisperResponse,
					},
				},
			});

			// Compose Transcription.Live with mocked OpenAI
			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const result = yield* transcription.transcribe(localTestFilePath);

						expect(result.text).toBe(mockWhisperResponse.text);
						expect(result.language).toBe("en");
						expect(result.duration).toBe(45.5);
						expect(result.segments).toHaveLength(3);
						expect(result.segments[0]?.start).toBe(0);
						expect(result.segments[0]?.text).toBe("This is a test");
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		itEffect.effect("returns error for non-existent file", () =>
			Effect.gen(function* () {
				const openAITestLayer = makeOpenAITestLayer({
					audio: {
						transcriptions: {
							create: async () => mockWhisperResponse,
						},
					},
				});

				const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

				const transcription = yield* Effect.provide(Transcription, testLayer);
				const exit = yield* transcription
					.transcribe("/nonexistent/path/audio.mp3")
					.pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(TranscriptionFailedError);
					if (error instanceof TranscriptionFailedError) {
						expect(error.reason).toContain("not found");
					}
				}
			}),
		);

		it("returns error for unsupported audio format", async () => {
			// Create a test file with unsupported extension
			testFilePath = await createTestAudioFile(".txt");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockWhisperResponse,
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const exit = yield* transcription
							.transcribe(localTestFilePath)
							.pipe(Effect.exit);

						expect(Exit.isFailure(exit)).toBe(true);
						if (Exit.isFailure(exit)) {
							const error =
								exit.cause._tag === "Fail" ? exit.cause.error : null;
							expect(error).toBeInstanceOf(TranscriptionFailedError);
							if (error instanceof TranscriptionFailedError) {
								expect(error.reason).toContain("Unsupported audio format");
								expect(error.reason).toContain(".txt");
							}
						}
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("accepts all supported audio formats", async () => {
			const supportedFormats = [
				".mp3",
				".mp4",
				".mpeg",
				".mpga",
				".m4a",
				".wav",
				".webm",
			];

			// Create all test files upfront
			const filePaths: string[] = [];
			for (const format of supportedFormats) {
				filePaths.push(await createTestAudioFile(format));
			}

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockWhisperResponse,
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						for (const filePath of filePaths) {
							const transcription = yield* Transcription;
							const result = yield* transcription.transcribe(filePath);
							expect(result.text).toBe(mockWhisperResponse.text);

							// Cleanup
							yield* Effect.promise(() => unlink(filePath).catch(() => {}));
						}
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("maps OpenAI 401 error to TranscriptionFailedError", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => {
							throw { status: 401, message: "Invalid API key" };
						},
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const exit = yield* transcription
							.transcribe(localTestFilePath)
							.pipe(Effect.exit);

						expect(Exit.isFailure(exit)).toBe(true);
						if (Exit.isFailure(exit)) {
							const error =
								exit.cause._tag === "Fail" ? exit.cause.error : null;
							expect(error).toBeInstanceOf(TranscriptionFailedError);
							if (error instanceof TranscriptionFailedError) {
								expect(error.reason).toContain("Invalid OpenAI API key");
							}
						}
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("maps OpenAI 429 error to TranscriptionFailedError", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => {
							throw { status: 429, message: "Rate limit exceeded" };
						},
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const exit = yield* transcription
							.transcribe(localTestFilePath)
							.pipe(Effect.exit);

						expect(Exit.isFailure(exit)).toBe(true);
						if (Exit.isFailure(exit)) {
							const error =
								exit.cause._tag === "Fail" ? exit.cause.error : null;
							expect(error).toBeInstanceOf(TranscriptionFailedError);
							if (error instanceof TranscriptionFailedError) {
								expect(error.reason).toContain("rate limit");
							}
						}
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("maps generic OpenAI error to TranscriptionFailedError", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => {
							throw { status: 500, message: "Internal server error" };
						},
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const exit = yield* transcription
							.transcribe(localTestFilePath)
							.pipe(Effect.exit);

						expect(Exit.isFailure(exit)).toBe(true);
						if (Exit.isFailure(exit)) {
							const error =
								exit.cause._tag === "Fail" ? exit.cause.error : null;
							expect(error).toBeInstanceOf(TranscriptionFailedError);
							if (error instanceof TranscriptionFailedError) {
								expect(error.reason).toContain("OpenAI API error");
							}
						}
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("handles missing segments in Whisper response", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => ({
							text: "No segments response",
							language: "en",
							duration: 10,
							// segments field is missing
						}),
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const result = yield* transcription.transcribe(localTestFilePath);

						expect(result.text).toBe("No segments response");
						expect(result.segments).toEqual([]);
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("trims whitespace from segment text", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => ({
							text: "Trimmed text",
							language: "en",
							duration: 5,
							segments: [
								{ id: 0, start: 0, end: 5, text: "  whitespace text  " },
							],
						}),
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const result = yield* transcription.transcribe(localTestFilePath);

						expect(result.segments[0]?.text).toBe("whitespace text");
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("defaults language to 'en' when not provided", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => ({
							text: "Test text",
							duration: 5,
							// language field missing
						}),
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const result = yield* transcription.transcribe(localTestFilePath);

						expect(result.language).toBe("en");
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});

		it("defaults duration to 0 when not provided", async () => {
			testFilePath = await createTestAudioFile(".mp3");
			const localTestFilePath = testFilePath;

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => ({
							text: "Test text",
							language: "en",
							// duration field missing
						}),
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const transcription = yield* Transcription;
						const result = yield* transcription.transcribe(localTestFilePath);

						expect(result.duration).toBe(0);
					}).pipe(Effect.provide(testLayer)),
				),
			);
		});
	});

	describe("service isolation", () => {
		itEffect.effect("each test layer is independent", () =>
			Effect.gen(function* () {
				const layer1 = makeTranscriptionTestLayer({
					transcribe: () =>
						Effect.succeed({
							text: "Layer 1 result",
							segments: [],
							language: "en",
							duration: 10,
						}),
				});

				const layer2 = makeTranscriptionTestLayer({
					transcribe: () =>
						Effect.succeed({
							text: "Layer 2 result",
							segments: [],
							language: "es",
							duration: 20,
						}),
				});

				const program = Effect.gen(function* () {
					const transcription = yield* Transcription;
					return yield* transcription.transcribe("/any/path.mp3");
				});

				const result1 = yield* program.pipe(Effect.provide(layer1));
				const result2 = yield* program.pipe(Effect.provide(layer2));

				expect(result1.text).toBe("Layer 1 result");
				expect(result1.language).toBe("en");
				expect(result2.text).toBe("Layer 2 result");
				expect(result2.language).toBe("es");
			}),
		);
	});
});
