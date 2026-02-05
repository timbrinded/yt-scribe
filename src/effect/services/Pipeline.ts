/**
 * Pipeline Effect Service
 *
 * Orchestration layer that coordinates the video processing pipeline:
 * fetch video → emit progress → download audio → transcribe → save transcript
 *
 * This service depends on multiple other services:
 * - Database: For video and transcript persistence
 * - YouTube: For audio download and metadata
 * - Transcription: For audio-to-text conversion
 * - Progress: For real-time progress events
 *
 * Key Effect-TS patterns demonstrated:
 * - Multiple service dependencies via `yield*` in Layer.effect
 * - Effect.tapError for cleanup on error (mark video as failed)
 * - Effect.ensuring for guaranteed file cleanup
 * - Typed error handling with PipelineServiceError
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const pipeline = yield* Pipeline
 *   const result = yield* pipeline.processVideo(1)
 *   console.log(result.status) // "completed"
 * })
 *
 * // Run with all dependencies
 * await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(Pipeline.Live),
 *     Effect.provide(Transcription.Live),
 *     Effect.provide(YouTube.Live),
 *     Effect.provide(Progress.Live),
 *     Effect.provide(Database.Live),
 *     Effect.provide(OpenAI.Live),
 *   )
 * )
 * ```
 */

import { unlinkSync } from "node:fs";
import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";
import { Database } from "./Database";
import { YouTube } from "./YouTube";
import { Transcription } from "./Transcription";
import { Progress, createProgressEvent } from "./Progress";
import { Analytics } from "./Analytics";
import {
	VideoNotFoundError,
	DownloadFailedError,
	TranscriptionFailedError,
	DatabaseError,
} from "../errors";
import type { PipelineServiceError } from "../errors";
import type {
	ProcessVideoResult,
	VideoStatus,
	DrizzleDatabase,
	YouTubeService,
	TranscriptionService,
	ProgressService,
	AnalyticsService,
} from "./types";
import { videos, transcripts } from "../../db/schema";

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * Pipeline service interface.
 * Provides video processing orchestration.
 */
export interface PipelineService {
	/**
	 * Processes a video through the full pipeline:
	 * 1. Fetch video record from DB
	 * 2. Update status to processing
	 * 3. Fetch metadata (if needed)
	 * 4. Download audio
	 * 5. Transcribe audio
	 * 6. Save transcript
	 * 7. Update status to completed
	 *
	 * On failure, sets video status to 'failed'.
	 *
	 * @param videoId - The ID of the video record in the database
	 * @returns Result with videoId, status, and optional transcriptId
	 */
	readonly processVideo: (
		videoId: number,
	) => Effect.Effect<ProcessVideoResult, PipelineServiceError>;
}

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Pipeline service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const pipeline = yield* Pipeline
 * const result = yield* pipeline.processVideo(videoId)
 * ```
 */
export class Pipeline extends Context.Tag("@ytscribe/Pipeline")<
	Pipeline,
	PipelineService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that processes videos through the full pipeline.
	 *
	 * Dependencies:
	 * - Database: Video/transcript persistence
	 * - YouTube: Audio download and metadata
	 * - Transcription: Audio-to-text conversion
	 * - Progress: Real-time progress events
	 *
	 * IMPORTANT: Do NOT call Layer.provide here.
	 * Layer composition happens in src/effect/layers/Live.ts.
	 */
	static readonly Live = Layer.effect(
		Pipeline,
		Effect.gen(function* () {
			// Get all dependencies from context
			const { db } = yield* Database;
			const youtube = yield* YouTube;
			const transcription = yield* Transcription;
			const progress = yield* Progress;
			const analyticsService = yield* Analytics;

			return {
				processVideo: (videoId: number) =>
					processVideoWithDeps(
						db,
						youtube,
						transcription,
						progress,
						analyticsService,
						videoId,
					),
			} satisfies PipelineService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer providing a mock pipeline service.
	 *
	 * Returns a helpful error message indicating the service needs mocking.
	 * Use makePipelineTestLayer() for specific mock implementations.
	 */
	static readonly Test = Layer.succeed(Pipeline, {
		processVideo: (_videoId: number) =>
			Effect.fail(
				new VideoNotFoundError({
					videoId: _videoId,
					message:
						"Pipeline mock: processVideo() was called but not mocked. " +
						"Use makePipelineTestLayer() to provide a mock implementation.",
				}),
			),
	} satisfies PipelineService);
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Processes a video through the full pipeline with all dependencies.
 */
function processVideoWithDeps(
	db: DrizzleDatabase,
	youtube: YouTubeService,
	transcription: TranscriptionService,
	progress: ProgressService,
	analyticsService: AnalyticsService,
	videoId: number,
): Effect.Effect<ProcessVideoResult, PipelineServiceError> {
	let audioPath: string | null = null;

	return Effect.gen(function* () {
		// 1. Fetch video record
		const video = db.select().from(videos).where(eq(videos.id, videoId)).get();
		if (!video) {
			return yield* new VideoNotFoundError({ videoId });
		}

		// 2. Update status to processing
		yield* updateVideoStatus(db, videoId, "processing");

		// Emit pending progress
		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "pending",
				message: "Starting video processing...",
			}),
		);

		// 3. Fetch metadata if not already present
		if (!video.title || !video.duration) {
			yield* fetchAndSaveMetadata(db, youtube, videoId, video.youtubeUrl);
		}

		// 4. Download audio
		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "downloading",
				progress: 0,
				message: "Downloading video...",
			}),
		);

		audioPath = yield* youtube.downloadAudio(video.youtubeUrl).pipe(
			Effect.mapError(
				(error) =>
					new DownloadFailedError({
						youtubeUrl: video.youtubeUrl,
						reason:
							error._tag === "DownloadFailedError"
								? error.reason
								: `Invalid URL: ${video.youtubeUrl}`,
					}),
			),
		);

		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "downloading",
				progress: 100,
				message: "Download complete",
			}),
		);

		// 4.5 Extract audio (yt-dlp does this as part of download, emit event for UI)
		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "extracting",
				progress: 100,
				message: "Audio extracted",
			}),
		);

		// 5. Transcribe audio
		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "transcribing",
				progress: 0,
				message: "Transcribing audio...",
			}),
		);

		const transcriptionResult = yield* transcription.transcribe(audioPath).pipe(
			Effect.mapError(
				(error) =>
					new TranscriptionFailedError({
						videoId,
						reason: error.reason,
					}),
			),
		);

		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "transcribing",
				progress: 100,
				message: "Transcription complete",
			}),
		);

		// 6. Save transcript to database
		// Cast segments to mutable array type expected by Drizzle schema
		const segmentsForDb = transcriptionResult.segments.map((s) => ({
			start: s.start,
			end: s.end,
			text: s.text,
		}));

		const transcriptResult = yield* Effect.try({
			try: () =>
				db
					.insert(transcripts)
					.values({
						videoId,
						content: transcriptionResult.text,
						segments: segmentsForDb,
						language: transcriptionResult.language,
					})
					.returning({ id: transcripts.id })
					.get(),
			catch: (error) =>
				new DatabaseError({
					operation: "insert transcript",
					reason: error instanceof Error ? error.message : String(error),
				}),
		});

		// 7. Update video status to completed
		yield* updateVideoStatus(db, videoId, "completed");

		// Track transcription_completed event (get userId from video)
		yield* analyticsService
			.trackEvent(video.userId, "transcription_completed", {
				videoId,
				transcriptId: transcriptResult?.id,
				language: transcriptionResult.language,
				duration: transcriptionResult.duration,
			})
			.pipe(Effect.catchAll(() => Effect.void)); // Don't fail on analytics errors

		// Emit complete progress
		yield* progress.emit(
			createProgressEvent({
				videoId,
				stage: "complete",
				message: "Processing complete!",
			}),
		);

		return {
			videoId,
			status: "completed" as const,
			transcriptId: transcriptResult?.id,
		} satisfies ProcessVideoResult;
	}).pipe(
		// On any error, mark video as failed
		Effect.tapError((error) =>
			Effect.gen(function* () {
				// Try to mark video as failed
				yield* updateVideoStatus(db, videoId, "failed").pipe(
					Effect.catchAll(() => Effect.void),
				);

				// Emit error progress
				yield* progress
					.emit(
						createProgressEvent({
							videoId,
							stage: "error",
							message: "Processing failed",
							error: getErrorMessage(error),
						}),
					)
					.pipe(Effect.catchAll(() => Effect.void));
			}),
		),
		// Ensure audio file cleanup
		Effect.ensuring(
			Effect.sync(() => {
				if (audioPath) {
					try {
						unlinkSync(audioPath);
					} catch {
						// Ignore cleanup errors
					}
				}
			}),
		),
	);
}

/**
 * Updates video status in the database.
 */
function updateVideoStatus(
	db: DrizzleDatabase,
	videoId: number,
	status: VideoStatus,
): Effect.Effect<void, DatabaseError> {
	return Effect.try({
		try: () => {
			db.update(videos)
				.set({ status, updatedAt: new Date() })
				.where(eq(videos.id, videoId))
				.run();
		},
		catch: (error) =>
			new DatabaseError({
				operation: `update video status to ${status}`,
				reason: error instanceof Error ? error.message : String(error),
			}),
	});
}

/**
 * Fetches metadata from YouTube and saves to database.
 * Non-fatal: errors are caught and logged but don't fail the pipeline.
 */
function fetchAndSaveMetadata(
	db: DrizzleDatabase,
	youtube: YouTubeService,
	videoId: number,
	youtubeUrl: string,
): Effect.Effect<void> {
	return Effect.gen(function* () {
		const metadata = yield* youtube.getMetadata(youtubeUrl);

		yield* Effect.try({
			try: () => {
				db.update(videos)
					.set({
						title: metadata.title,
						duration: metadata.duration,
						thumbnailUrl: metadata.thumbnailUrl,
						updatedAt: new Date(),
					})
					.where(eq(videos.id, videoId))
					.run();
			},
			catch: () => undefined, // Ignore DB errors for metadata
		});
	}).pipe(
		// Catch all errors - metadata is non-critical
		Effect.catchAll(() => Effect.void),
	);
}

/**
 * Extracts a user-friendly error message from pipeline errors.
 */
function getErrorMessage(error: PipelineServiceError): string {
	switch (error._tag) {
		case "VideoNotFoundError":
			return error.displayMessage;
		case "DownloadFailedError":
			return `Download failed: ${error.reason}`;
		case "TranscriptionFailedError":
			return `Transcription failed: ${error.reason}`;
		case "DatabaseError":
			return `Database error: ${error.reason}`;
	}
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom mock implementations.
 *
 * @example
 * ```typescript
 * const testLayer = makePipelineTestLayer({
 *   processVideo: (videoId) =>
 *     Effect.succeed({
 *       videoId,
 *       status: "completed",
 *       transcriptId: 1,
 *     }),
 * })
 * ```
 */
export function makePipelineTestLayer(
	implementation: Partial<PipelineService>,
): Layer.Layer<Pipeline> {
	const defaultImplementation: PipelineService = {
		processVideo: (videoId: number) =>
			Effect.fail(
				new VideoNotFoundError({
					videoId,
					message: "processVideo() not mocked",
				}),
			),
	};

	return Layer.succeed(Pipeline, {
		...defaultImplementation,
		...implementation,
	} satisfies PipelineService);
}
