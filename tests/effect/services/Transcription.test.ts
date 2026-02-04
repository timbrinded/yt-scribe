/**
 * Tests for the Effect-TS Transcription service.
 *
 * This service has a dependency on the OpenAI service, demonstrating
 * the Effect-TS DI pattern for service composition and testing.
 */

import { describe, expect, test, afterEach } from "bun:test";
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
		test("returns helpful error message indicating mock needed", async () => {
			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe("/path/to/audio.mp3");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Transcription.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.reason).toContain("not mocked");
					expect(error.reason).toContain("makeTranscriptionTestLayer");
				}
			}
		});
	});

	describe("makeTranscriptionTestLayer factory", () => {
		test("allows mocking transcription results", async () => {
			const mockResult = {
				text: "Mocked transcription",
				segments: [{ start: 0, end: 5, text: "Mocked transcription" }],
				language: "en",
				duration: 5,
			};

			const testLayer = makeTranscriptionTestLayer({
				transcribe: () => Effect.succeed(mockResult),
			});

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe("/any/path.mp3");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.text).toBe("Mocked transcription");
			expect(result.segments).toHaveLength(1);
			expect(result.language).toBe("en");
			expect(result.duration).toBe(5);
		});

		test("allows mocking transcription errors", async () => {
			const testLayer = makeTranscriptionTestLayer({
				transcribe: () =>
					Effect.fail(
						new TranscriptionFailedError({
							videoId: 123,
							reason: "Custom error message",
						}),
					),
			});

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe("/any/path.mp3");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.videoId).toBe(123);
					expect(error.reason).toBe("Custom error message");
				}
			}
		});

		test("tracks file paths passed to transcribe", async () => {
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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe("/specific/path/audio.m4a");
			});

			await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

			expect(capturedPaths).toHaveLength(1);
			expect(capturedPaths[0]).toBe("/specific/path/audio.m4a");
		});
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

		test("successfully transcribes audio file with mocked Whisper", async () => {
			// Create a test audio file
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.text).toBe(mockWhisperResponse.text);
			expect(result.language).toBe("en");
			expect(result.duration).toBe(45.5);
			expect(result.segments).toHaveLength(3);
			expect(result.segments[0]?.start).toBe(0);
			expect(result.segments[0]?.text).toBe("This is a test");
		});

		test("returns error for non-existent file", async () => {
			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockWhisperResponse,
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe("/nonexistent/path/audio.mp3");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.reason).toContain("not found");
				}
			}
		});

		test("returns error for unsupported audio format", async () => {
			// Create a test file with unsupported extension
			testFilePath = await createTestAudioFile(".txt");

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockWhisperResponse,
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.reason).toContain("Unsupported audio format");
					expect(error.reason).toContain(".txt");
				}
			}
		});

		test("accepts all supported audio formats", async () => {
			const supportedFormats = [
				".mp3",
				".mp4",
				".mpeg",
				".mpga",
				".m4a",
				".wav",
				".webm",
			];

			const openAITestLayer = makeOpenAITestLayer({
				audio: {
					transcriptions: {
						create: async () => mockWhisperResponse,
					},
				},
			});

			const testLayer = Layer.provide(Transcription.Live, openAITestLayer);

			for (const format of supportedFormats) {
				const filePath = await createTestAudioFile(format);
				try {
					const program = Effect.gen(function* () {
						const transcription = yield* Transcription;
						return yield* transcription.transcribe(filePath);
					});

					const result = await Effect.runPromise(
						program.pipe(Effect.provide(testLayer)),
					);

					expect(result.text).toBe(mockWhisperResponse.text);
				} finally {
					await unlink(filePath).catch(() => {
						/* ignore */
					});
				}
			}
		});

		test("maps OpenAI 401 error to TranscriptionFailedError", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.reason).toContain("Invalid OpenAI API key");
				}
			}
		});

		test("maps OpenAI 429 error to TranscriptionFailedError", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.reason).toContain("rate limit");
				}
			}
		});

		test("maps generic OpenAI error to TranscriptionFailedError", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
				expect(error).toBeInstanceOf(TranscriptionFailedError);
				if (error instanceof TranscriptionFailedError) {
					expect(error.reason).toContain("OpenAI API error");
				}
			}
		});

		test("handles missing segments in Whisper response", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.text).toBe("No segments response");
			expect(result.segments).toEqual([]);
		});

		test("trims whitespace from segment text", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.segments[0]?.text).toBe("whitespace text");
		});

		test("defaults language to 'en' when not provided", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.language).toBe("en");
		});

		test("defaults duration to 0 when not provided", async () => {
			testFilePath = await createTestAudioFile(".mp3");

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

			const program = Effect.gen(function* () {
				const transcription = yield* Transcription;
				return yield* transcription.transcribe(testFilePath!);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.duration).toBe(0);
		});
	});

	describe("service isolation", () => {
		test("each test layer is independent", async () => {
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

			const result1 = await Effect.runPromise(
				program.pipe(Effect.provide(layer1)),
			);
			const result2 = await Effect.runPromise(
				program.pipe(Effect.provide(layer2)),
			);

			expect(result1.text).toBe("Layer 1 result");
			expect(result1.language).toBe("en");
			expect(result2.text).toBe("Layer 2 result");
			expect(result2.language).toBe("es");
		});
	});
});
