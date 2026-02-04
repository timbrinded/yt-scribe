import OpenAI from "openai";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type { TranscriptSegment } from "../db/schema";
import { logger } from "../utils/logger";

/**
 * Audio transcription service using OpenAI Whisper API
 */

// Lazy-initialized OpenAI client to avoid keeping connections open at module load
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
	if (!_openai) {
		_openai = new OpenAI();
	}
	return _openai;
}

/**
 * Result of transcription including full text and timestamped segments
 */
export interface TranscriptionResult {
	/** Full transcript text */
	text: string;
	/** Timestamped segments */
	segments: TranscriptSegment[];
	/** Detected language code */
	language: string;
	/** Duration of the audio in seconds */
	duration: number;
}

/**
 * Error types for transcription failures
 */
export type TranscriptionErrorCode =
	| "FILE_NOT_FOUND"
	| "COMPRESSION_FAILED"
	| "INVALID_AUDIO_FORMAT"
	| "API_ERROR"
	| "RATE_LIMIT"
	| "AUTHENTICATION_ERROR";

/**
 * Typed error for transcription failures
 */
export class TranscriptionError extends Error {
	code: TranscriptionErrorCode;

	constructor(code: TranscriptionErrorCode, message: string) {
		super(message);
		this.name = "TranscriptionError";
		this.code = code;
	}
}

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

/**
 * Compresses audio for transcription using ffmpeg
 * Optimized for speech: mono, 16kHz, 64kbps MP3
 * @param inputPath - Path to the original audio file
 * @returns Path to the compressed temporary file
 */
async function compressAudioForTranscription(
	inputPath: string,
): Promise<string> {
	const outputPath = join(tmpdir(), `transcribe-${Date.now()}.mp3`);

	logger.info({ inputPath, outputPath }, "Compressing audio for transcription");

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
		logger.error({ exitCode, stderr }, "ffmpeg compression failed");
		throw new TranscriptionError(
			"COMPRESSION_FAILED",
			`Audio compression failed: ${stderr.slice(-200)}`,
		);
	}

	const compressedSize = Bun.file(outputPath).size;
	logger.info(
		{ outputPath, compressedSizeMB: (compressedSize / 1024 / 1024).toFixed(2) },
		"Audio compression completed",
	);

	return outputPath;
}

/**
 * Transcribes an audio file using OpenAI Whisper API
 * @param filePath - Path to the audio file to transcribe
 * @returns Transcription result with text, segments, language, and duration
 * @throws TranscriptionError with typed error codes for various failure modes
 */
export async function transcribeAudio(
	filePath: string,
): Promise<TranscriptionResult> {
	// Check if file exists
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		throw new TranscriptionError(
			"FILE_NOT_FOUND",
			`Audio file not found: ${filePath}`,
		);
	}

	// Check file extension
	const extension = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
	if (!SUPPORTED_FORMATS.includes(extension)) {
		throw new TranscriptionError(
			"INVALID_AUDIO_FORMAT",
			`Unsupported audio format: ${extension}. Supported formats: ${SUPPORTED_FORMATS.join(", ")}`,
		);
	}

	if (!process.env.OPENAI_API_KEY) {
		throw new TranscriptionError(
			"AUTHENTICATION_ERROR",
			"OpenAI API key not set",
		);
	}

	// Check file size and compress if needed
	const fileSize = file.size;
	const needsCompression = fileSize > MAX_FILE_SIZE;
	let fileToTranscribe = file;
	let tempFilePath: string | null = null;

	if (needsCompression) {
		logger.info(
			{ filePath, sizeMB: (fileSize / 1024 / 1024).toFixed(2) },
			"File exceeds 25MB limit, compressing for transcription",
		);
		tempFilePath = await compressAudioForTranscription(filePath);
		fileToTranscribe = Bun.file(tempFilePath);
	}

	logger.debug(
		{
			filePath,
			fileSize: fileSize / 1024 / 1024,
			extension,
			compressed: needsCompression,
		},
		"Starting audio transcription",
	);

	try {
		// Call OpenAI Whisper API with verbose_json for timestamps
		const transcription = await getOpenAI().audio.transcriptions.create({
			file: fileToTranscribe,
			model: "whisper-1",
			response_format: "verbose_json",
			timestamp_granularities: ["segment"],
		});

		// Parse segments from response
		const segments: TranscriptSegment[] = (transcription.segments ?? []).map(
			(segment) => ({
				start: segment.start,
				end: segment.end,
				text: segment.text.trim(),
			}),
		);

		logger.info(
			{
				language: transcription.language,
				duration: transcription.duration,
				segmentCount: segments.length,
			},
			"Transcription completed successfully",
		);

		return {
			text: transcription.text,
			segments,
			language: transcription.language ?? "en",
			duration: transcription.duration ?? 0,
		};
	} catch (error) {
		// Handle OpenAI-specific errors
		if (error instanceof OpenAI.APIError) {
			logger.error(
				{ status: error.status, message: error.message, filePath },
				"OpenAI Whisper API error",
			);
			if (error.status === 401) {
				throw new TranscriptionError(
					"AUTHENTICATION_ERROR",
					"Invalid OpenAI API key",
				);
			}
			if (error.status === 429) {
				throw new TranscriptionError(
					"RATE_LIMIT",
					"OpenAI API rate limit exceeded. Please try again later.",
				);
			}
			throw new TranscriptionError(
				"API_ERROR",
				`OpenAI API error: ${error.message}`,
			);
		}

		// Re-throw TranscriptionErrors as-is
		if (error instanceof TranscriptionError) {
			throw error;
		}

		// Unknown errors
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				filePath,
			},
			"Unknown transcription error",
		);
		throw new TranscriptionError(
			"API_ERROR",
			`Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	} finally {
		// Clean up temp file if we compressed (in case of errors)
		if (tempFilePath) {
			await unlink(tempFilePath).catch((err) =>
				logger.warn(
					{ tempFilePath, error: err.message },
					"Failed to clean up temp file",
				),
			);
		}
	}
}
