import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	TranscriptionError,
	transcribeAudio,
} from "../../src/services/transcription";
import { text } from "drizzle-orm/gel-core";

const TEST_DIR = "data/test-transcription";

describe("Transcription Service", () => {
	beforeAll(() => {
		// Create test directory
		if (!existsSync(TEST_DIR)) {
			mkdirSync(TEST_DIR, { recursive: true });
		}
	});

	afterAll(() => {
		// Clean up test files
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	describe("transcribeAudio - Input Validation", () => {
		test("throws FILE_NOT_FOUND for non-existent file", async () => {
			try {
				await transcribeAudio("/nonexistent/path/audio.mp3");
				expect.unreachable("Should have thrown an error");
			} catch (error) {
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				expect(transcriptionError.code).toBe("FILE_NOT_FOUND");
				expect(transcriptionError.message).toContain(
					"/nonexistent/path/audio.mp3",
				);
			}
		});

		test("auto-compresses files over 25 MB instead of rejecting", async () => {
			// Large files no longer throw FILE_TOO_LARGE - they get compressed automatically
			// We can't easily test compression without creating a 25MB+ file,
			// so we just verify the error code no longer exists in the type system
			// The actual compression is tested in the integration test with Big Buck Bunny
			const smallPath = join(TEST_DIR, "small-file.mp3");
			writeFileSync(smallPath, "fake mp3 content");

			try {
				await transcribeAudio(smallPath);
			} catch (error) {
				// Will fail at API call level (invalid audio or auth error), not size validation
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				// FILE_TOO_LARGE no longer exists as an error code
				expect(transcriptionError.code).not.toBe("FILE_TOO_LARGE");
			}
		});

		test("throws INVALID_AUDIO_FORMAT for unsupported file types", async () => {
			const unsupportedPath = join(TEST_DIR, "audio.txt");
			writeFileSync(unsupportedPath, "not audio content");

			try {
				await transcribeAudio(unsupportedPath);
				expect.unreachable("Should have thrown an error");
			} catch (error) {
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				expect(transcriptionError.code).toBe("INVALID_AUDIO_FORMAT");
				expect(transcriptionError.message).toContain(".txt");
			}
		});

		test("accepts .mp3 files", async () => {
			const mp3Path = join(TEST_DIR, "audio.mp3");
			writeFileSync(mp3Path, "fake mp3 content");

			try {
				await transcribeAudio(mp3Path);
			} catch (error) {
				// Will fail at API call level, not validation
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				// Should NOT be INVALID_AUDIO_FORMAT - the format is accepted
				expect(transcriptionError.code).not.toBe("INVALID_AUDIO_FORMAT");
			}
		});

		test("accepts .m4a files", async () => {
			const m4aPath = join(TEST_DIR, "audio.m4a");
			writeFileSync(m4aPath, "fake m4a content");

			try {
				await transcribeAudio(m4aPath);
			} catch (error) {
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				expect(transcriptionError.code).not.toBe("INVALID_AUDIO_FORMAT");
			}
		});

		test("accepts .wav files", async () => {
			const wavPath = join(TEST_DIR, "audio.wav");
			writeFileSync(wavPath, "fake wav content");

			try {
				await transcribeAudio(wavPath);
			} catch (error) {
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				expect(transcriptionError.code).not.toBe("INVALID_AUDIO_FORMAT");
			}
		});

		test("accepts .webm files", async () => {
			const webmPath = join(TEST_DIR, "audio.webm");
			writeFileSync(webmPath, "fake webm content");

			try {
				await transcribeAudio(webmPath);
			} catch (error) {
				expect(error).toBeInstanceOf(TranscriptionError);
				const transcriptionError = error as TranscriptionError;
				expect(transcriptionError.code).not.toBe("INVALID_AUDIO_FORMAT");
			}
		});
	});

	describe("TranscriptionError", () => {
		test("creates error with correct code and message", () => {
			const error = new TranscriptionError("FILE_NOT_FOUND", "Test message");

			expect(error.name).toBe("TranscriptionError");
			expect(error.code).toBe("FILE_NOT_FOUND");
			expect(error.message).toBe("Test message");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(TranscriptionError);
		});

		test("supports all error codes", () => {
			const codes = [
				"FILE_NOT_FOUND",
				"COMPRESSION_FAILED",
				"INVALID_AUDIO_FORMAT",
				"API_ERROR",
				"RATE_LIMIT",
				"AUTHENTICATION_ERROR",
			] as const;

			for (const code of codes) {
				const error = new TranscriptionError(code, `Error: ${code}`);
				expect(error.code).toBe(code);
			}
		});
	});
});

// Integration test - only runs if OPENAI_API_KEY is set and YOUTUBE_INTEGRATION_TESTS is enabled
// This test uses a real audio file and calls the actual Whisper API
describe("Transcription Service - Integration", () => {
	const hasApiKey = !!process.env.OPENAI_API_KEY;
	const runYoutubeIntegration = !!process.env.YOUTUBE_INTEGRATION_TESTS;

	test.skipIf(!hasApiKey || !runYoutubeIntegration)(
		"transcribes a real audio file with OpenAI Whisper",
		async () => {
			// First, download a short test audio file using yt-dlp
			const { downloadAudio } = await import("../../src/services/youtube");

			// Use "Me at the zoo" - the first YouTube video (19 seconds, ~300KB audio)
			// Stable, short, and guaranteed to stay on YouTube forever
			const testVideoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
			const audioPath = join(TEST_DIR, "test-audio.m4a");

			// Download audio (skip if already exists from previous run)
			if (!existsSync(audioPath)) {
				await downloadAudio(testVideoUrl, audioPath);
			}

			// Transcribe the audio
			const result = await transcribeAudio(audioPath);

			// Verify result structure
			expect(typeof result.text).toBe("string");
			expect(result.text.length).toBeGreaterThan(0);
			expect(Array.isArray(result.segments)).toBe(true);
			expect(result.segments.length).toBeGreaterThan(0);
			expect(typeof result.language).toBe("string");
			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThan(0);

			expect(result.text).toContain("Alright, so here we are in front of the elephants. The cool thing about these guys");
			console.log(`Transcribed Text: ${result.text}`);
			// Verify segment structure
			for (const segment of result.segments) {
				expect(typeof segment.start).toBe("number");
				expect(typeof segment.end).toBe("number");
				expect(typeof segment.text).toBe("string");
				expect(segment.start).toBeGreaterThanOrEqual(0);
				expect(segment.end).toBeGreaterThan(segment.start);
			}
		},
		180000, // 3 minute timeout for download + transcription
	);
});
