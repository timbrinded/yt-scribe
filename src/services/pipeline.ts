import { unlinkSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { transcripts, type Video, videos } from "../db/schema";
import { TranscriptionError, transcribeAudio } from "./transcription";
import { downloadAudio, getVideoMetadata } from "./youtube";

/**
 * Video processing pipeline
 * Orchestrates: fetch video → download audio → transcribe → save to DB
 */

/**
 * Error types for pipeline failures
 */
export type PipelineErrorCode =
	| "VIDEO_NOT_FOUND"
	| "DOWNLOAD_FAILED"
	| "TRANSCRIPTION_FAILED"
	| "DATABASE_ERROR";

/**
 * Typed error for pipeline failures
 */
export class PipelineError extends Error {
	code: PipelineErrorCode;

	constructor(code: PipelineErrorCode, message: string) {
		super(message);
		this.name = "PipelineError";
		this.code = code;
	}
}

/**
 * Updates video status in the database
 */
async function updateVideoStatus(
	videoId: number,
	status: Video["status"],
): Promise<void> {
	db.update(videos)
		.set({ status, updatedAt: new Date() })
		.where(eq(videos.id, videoId))
		.run();
}

/**
 * Fetches a video record by ID
 */
function getVideoById(videoId: number): Video | undefined {
	return db.select().from(videos).where(eq(videos.id, videoId)).get();
}

/**
 * Processes a video through the full pipeline:
 * 1. Fetches video record from DB
 * 2. Downloads audio using yt-dlp
 * 3. Transcribes audio using OpenAI Whisper
 * 4. Saves transcript to database
 * 5. Updates video status to 'completed'
 * 6. Cleans up temporary audio file
 *
 * On failure, sets video status to 'failed' and throws PipelineError
 *
 * @param videoId - The ID of the video record in the database
 * @throws PipelineError with typed error codes for various failure modes
 */
export async function processVideo(videoId: number): Promise<void> {
	let audioPath: string | null = null;

	try {
		// 1. Fetch video record
		const video = getVideoById(videoId);
		if (!video) {
			throw new PipelineError(
				"VIDEO_NOT_FOUND",
				`Video with ID ${videoId} not found`,
			);
		}

		// 2. Update status to processing
		await updateVideoStatus(videoId, "processing");

		// 3. Fetch metadata if not already present (title, duration, thumbnail)
		if (!video.title || !video.duration) {
			try {
				const metadata = await getVideoMetadata(video.youtubeUrl);
				db.update(videos)
					.set({
						title: metadata.title,
						duration: metadata.duration,
						thumbnailUrl: metadata.thumbnailUrl,
						updatedAt: new Date(),
					})
					.where(eq(videos.id, videoId))
					.run();
			} catch {
				// Metadata fetch failed - continue anyway, not critical
			}
		}

		// 4. Download audio
		try {
			audioPath = await downloadAudio(video.youtubeUrl);
		} catch (error) {
			throw new PipelineError(
				"DOWNLOAD_FAILED",
				`Failed to download audio: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		// 5. Transcribe audio
		let transcriptionResult: Awaited<ReturnType<typeof transcribeAudio>>;
		try {
			transcriptionResult = await transcribeAudio(audioPath);
		} catch (error) {
			if (error instanceof TranscriptionError) {
				throw new PipelineError(
					"TRANSCRIPTION_FAILED",
					`Transcription failed (${error.code}): ${error.message}`,
				);
			}
			throw new PipelineError(
				"TRANSCRIPTION_FAILED",
				`Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		// 6. Save transcript to database
		try {
			db.insert(transcripts)
				.values({
					videoId,
					content: transcriptionResult.text,
					segments: transcriptionResult.segments,
					language: transcriptionResult.language,
				})
				.run();
		} catch (error) {
			throw new PipelineError(
				"DATABASE_ERROR",
				`Failed to save transcript: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		// 7. Update video status to completed
		await updateVideoStatus(videoId, "completed");

		// 8. Clean up audio file
		if (audioPath) {
			try {
				unlinkSync(audioPath);
			} catch {
				// Cleanup failed - log but don't throw
				console.warn(`Failed to clean up audio file: ${audioPath}`);
			}
		}
	} catch (error) {
		// Set video status to failed (if video exists)
		try {
			await updateVideoStatus(videoId, "failed");
		} catch {
			// Ignore - video might not exist
		}

		// Clean up audio file on error
		if (audioPath) {
			try {
				unlinkSync(audioPath);
			} catch {
				// Ignore cleanup errors
			}
		}

		// Re-throw PipelineErrors as-is
		if (error instanceof PipelineError) {
			throw error;
		}

		// Wrap unknown errors
		throw new PipelineError(
			"DATABASE_ERROR",
			`Pipeline failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}
