/**
 * Transcription Effect Service
 *
 * Provides audio transcription using OpenAI Whisper API. This is the first
 * service with an Effect-TS dependency - it depends on the OpenAI service.
 *
 * Key patterns demonstrated:
 * - Service dependency via `yield* OpenAI` in Layer.effect
 * - Effect.tryPromise for async operations
 * - Effect.ensuring for guaranteed cleanup (temp files)
 * - Typed error handling with TranscriptionFailedError
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const transcription = yield* Transcription
 *   const result = yield* transcription.transcribe("/path/to/audio.mp3")
 *   console.log(result.text)
 *   console.log(result.segments)
 * })
 *
 * // Run with live OpenAI client
 * await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(Transcription.Live),
 *     Effect.provide(OpenAI.Live)
 *   )
 * )
 * ```
 */

import { Context, Effect, Layer } from "effect";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type OpenAIClient from "openai";
import { OpenAI } from "./OpenAI";
import { TranscriptionFailedError } from "../errors";
import type {
	TranscriptionService,
	TranscriptionResult,
	TranscriptSegment,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum file size for Whisper API (25 MB)
 */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Supported audio file extensions
 */
const SUPPORTED_FORMATS = [
	".mp3",
	".mp4",
	".mpeg",
	".mpga",
	".m4a",
	".wav",
	".webm",
];

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Transcription service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const transcription = yield* Transcription
 * const result = yield* transcription.transcribe("/path/to/audio.mp3")
 * ```
 */
export class Transcription extends Context.Tag("@ytscribe/Transcription")<
	Transcription,
	TranscriptionService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that transcribes audio using OpenAI Whisper API.
	 *
	 * IMPORTANT: Do NOT call Layer.provide(OpenAI.Live) here.
	 * Layer composition happens in src/effect/layers/Live.ts.
	 *
	 * Dependencies: OpenAI service
	 */
	static readonly Live = Layer.effect(
		Transcription,
		Effect.gen(function* () {
			// Get the OpenAI client from context
			const { client } = yield* OpenAI;

			return {
				transcribe: (filePath: string) =>
					transcribeWithClient(client, filePath),
			} satisfies TranscriptionService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer providing a mock transcription service.
	 *
	 * Returns a helpful error message indicating the service needs mocking.
	 * Use makeTranscriptionTestLayer() for specific mock implementations.
	 */
	static readonly Test = Layer.succeed(Transcription, {
		transcribe: (_filePath: string) =>
			Effect.fail(
				new TranscriptionFailedError({
					videoId: 0,
					reason:
						"Transcription mock: transcribe() was called but not mocked. " +
						"Use makeTranscriptionTestLayer() to provide a mock implementation.",
				}),
			),
	} satisfies TranscriptionService);
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Transcribes an audio file using the OpenAI Whisper API.
 *
 * Flow:
 * 1. Validate file exists
 * 2. Validate file format
 * 3. Check file size, compress if needed
 * 4. Call Whisper API
 * 5. Parse response into segments
 * 6. Clean up temp files
 */
function transcribeWithClient(
	client: OpenAIClient,
	filePath: string,
): Effect.Effect<TranscriptionResult, TranscriptionFailedError> {
	return Effect.gen(function* () {
		// Validate file exists
		const file = Bun.file(filePath);
		const exists = yield* Effect.tryPromise({
			try: () => file.exists(),
			catch: (error) =>
				new TranscriptionFailedError({
					videoId: 0,
					reason: `Failed to check file existence: ${error instanceof Error ? error.message : String(error)}`,
				}),
		});

		if (!exists) {
			return yield* Effect.fail(
				new TranscriptionFailedError({
					videoId: 0,
					reason: `Audio file not found: ${filePath}`,
				}),
			);
		}

		// Validate file format
		const extension = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
		if (!SUPPORTED_FORMATS.includes(extension)) {
			return yield* Effect.fail(
				new TranscriptionFailedError({
					videoId: 0,
					reason: `Unsupported audio format: ${extension}. Supported formats: ${SUPPORTED_FORMATS.join(", ")}`,
				}),
			);
		}

		// Check file size and compress if needed
		const fileSize = file.size;
		const needsCompression = fileSize > MAX_FILE_SIZE;
		let fileToTranscribe = file;
		let tempFilePath: string | null = null;

		if (needsCompression) {
			const compressed = yield* compressAudio(filePath);
			tempFilePath = compressed;
			fileToTranscribe = Bun.file(compressed);
		}

		// Call Whisper API with cleanup guarantee
		const result = yield* Effect.tryPromise({
			try: async () => {
				const transcription = await client.audio.transcriptions.create({
					file: fileToTranscribe,
					model: "whisper-1",
					response_format: "verbose_json",
					timestamp_granularities: ["segment"],
				});

				// Parse segments from response
				const segments: TranscriptSegment[] = (
					transcription.segments ?? []
				).map((segment) => ({
					start: segment.start,
					end: segment.end,
					text: segment.text.trim(),
				}));

				return {
					text: transcription.text,
					segments,
					language: transcription.language ?? "en",
					duration: transcription.duration ?? 0,
				} satisfies TranscriptionResult;
			},
			catch: (error) => mapOpenAIError(error),
		}).pipe(
			// Ensure temp file cleanup even on error
			Effect.ensuring(
				tempFilePath
					? Effect.promise(() =>
							unlink(tempFilePath).catch(() => {
								// Ignore cleanup errors
							}),
						)
					: Effect.void,
			),
		);

		return result;
	});
}

/**
 * Compresses audio for transcription using ffmpeg.
 * Optimized for speech: mono, 16kHz, 64kbps MP3
 */
function compressAudio(
	inputPath: string,
): Effect.Effect<string, TranscriptionFailedError> {
	return Effect.tryPromise({
		try: async () => {
			const outputPath = join(tmpdir(), `transcribe-${Date.now()}.mp3`);

			const proc = Bun.spawn(
				[
					"ffmpeg",
					"-i",
					inputPath,
					"-ac",
					"1", // Mono
					"-ar",
					"16000", // 16kHz sample rate
					"-b:a",
					"64k", // 64kbps bitrate
					"-y", // Overwrite output
					outputPath,
				],
				{
					stderr: "pipe",
				},
			);

			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				throw new Error(`Audio compression failed: ${stderr.slice(-200)}`);
			}

			return outputPath;
		},
		catch: (error) =>
			new TranscriptionFailedError({
				videoId: 0,
				reason: `Compression failed: ${error instanceof Error ? error.message : String(error)}`,
			}),
	});
}

/**
 * Maps OpenAI API errors to TranscriptionFailedError.
 */
function mapOpenAIError(error: unknown): TranscriptionFailedError {
	// Import OpenAI dynamically to check error type
	// We need to check if it's an APIError
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		"message" in error
	) {
		const apiError = error as { status: number; message: string };

		if (apiError.status === 401) {
			return new TranscriptionFailedError({
				videoId: 0,
				reason: "Invalid OpenAI API key",
			});
		}
		if (apiError.status === 429) {
			return new TranscriptionFailedError({
				videoId: 0,
				reason: "OpenAI API rate limit exceeded. Please try again later.",
			});
		}
		return new TranscriptionFailedError({
			videoId: 0,
			reason: `OpenAI API error: ${apiError.message}`,
		});
	}

	return new TranscriptionFailedError({
		videoId: 0,
		reason: `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
	});
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom mock implementations.
 *
 * @example
 * ```typescript
 * const testLayer = makeTranscriptionTestLayer({
 *   transcribe: (filePath) =>
 *     Effect.succeed({
 *       text: "Mocked transcription text",
 *       segments: [{ start: 0, end: 5, text: "Mocked" }],
 *       language: "en",
 *       duration: 60,
 *     }),
 * })
 * ```
 */
export function makeTranscriptionTestLayer(
	implementation: Partial<TranscriptionService>,
): Layer.Layer<Transcription> {
	const defaultImplementation: TranscriptionService = {
		transcribe: (_filePath: string) =>
			Effect.fail(
				new TranscriptionFailedError({
					videoId: 0,
					reason: "transcribe() not mocked",
				}),
			),
	};

	return Layer.succeed(Transcription, {
		...defaultImplementation,
		...implementation,
	} satisfies TranscriptionService);
}
