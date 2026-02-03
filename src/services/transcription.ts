import OpenAI from "openai";
import type { TranscriptSegment } from "../db/schema";

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
	| "FILE_TOO_LARGE"
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

	// Check file size
	const fileSize = file.size;
	if (fileSize > MAX_FILE_SIZE) {
		throw new TranscriptionError(
			"FILE_TOO_LARGE",
			`File size ${(fileSize / 1024 / 1024).toFixed(2)} MB exceeds maximum of 25 MB`,
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

	try {
		// Call OpenAI Whisper API with verbose_json for timestamps
		const transcription = await getOpenAI().audio.transcriptions.create({
			file: file,
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

		return {
			text: transcription.text,
			segments,
			language: transcription.language ?? "en",
			duration: transcription.duration ?? 0,
		};
	} catch (error) {
		// Handle OpenAI-specific errors
		if (error instanceof OpenAI.APIError) {
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
		throw new TranscriptionError(
			"API_ERROR",
			`Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}
