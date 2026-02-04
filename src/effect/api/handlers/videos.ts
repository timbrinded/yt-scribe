/**
 * Effect-TS Video Endpoint Handlers
 *
 * Implements the video API endpoints using HttpApiBuilder.group pattern.
 * Each handler accesses the authenticated user via CurrentUser context
 * and uses the Database service for persistence.
 *
 * Endpoints:
 * - createVideo: POST /videos - Add new video, trigger pipeline
 * - listVideos: GET /videos - List user's video library with pagination
 * - getVideo: GET /videos/:id - Get video details with transcript
 * - retryVideo: POST /videos/:id/retry - Retry failed transcription
 * - videoStatus: GET /videos/:id/status - SSE stream (handled separately)
 *
 * @example
 * ```typescript
 * const VideosGroupLive = HttpApiBuilder.group(YTScribeApi, "videos", (handlers) =>
 *   handlers
 *     .handle("createVideo", createVideoHandler)
 *     .handle("listVideos", listVideosHandler)
 *     .handle("getVideo", getVideoHandler)
 *     .handle("retryVideo", retryVideoHandler)
 * )
 * ```
 */

import { HttpApiBuilder, HttpServerResponse } from "@effect/platform";
import { Effect, Option, Stream } from "effect";
import { and, desc, eq } from "drizzle-orm";
import { YTScribeApi } from "../index";
import { CurrentUser } from "../middleware/auth";
import { Database } from "../../services/Database";
import { YouTube } from "../../services/YouTube";
import { Pipeline } from "../../services/Pipeline";
import { Progress } from "../../services/Progress";
import { Analytics } from "../../services/Analytics";
import {
	InvalidYouTubeUrlError,
	ConflictError,
	VideoNotFoundError,
	ForbiddenError,
	BadRequestError,
} from "../../errors";
import { videos, transcripts } from "../../../db/schema";
import type {
	VideoResponse,
	VideoDetailResponse,
	VideoListResponse,
	RetryVideoResponse,
	TranscriptResponse,
} from "../groups/videos";

// =============================================================================
// HANDLER: createVideo
// =============================================================================

/**
 * POST /videos - Create a new video for transcription.
 *
 * 1. Validates YouTube URL format
 * 2. Extracts video ID from URL
 * 3. Checks for duplicate (same youtubeId + userId)
 * 4. Creates video record with status 'pending'
 * 5. Triggers pipeline processing (fire-and-forget via forkDaemon)
 * 6. Returns video record with 201 status
 */
const createVideoHandler = ({ payload }: { payload: { url: string } }) =>
	Effect.gen(function* () {
		const { url } = payload;
		const user = yield* CurrentUser;
		const { db } = yield* Database;
		const youtube = yield* YouTube;
		const pipeline = yield* Pipeline;
		const analyticsService = yield* Analytics;

		// Validate YouTube URL format
		if (!youtube.isValidUrl(url)) {
			return yield* new InvalidYouTubeUrlError({ url });
		}

		// Extract video ID from URL
		const youtubeId = youtube.extractVideoId(url);
		if (!youtubeId) {
			return yield* new InvalidYouTubeUrlError({ url });
		}

		// Check for duplicate (same youtubeId + userId)
		const existingVideo = db
			.select()
			.from(videos)
			.where(and(eq(videos.youtubeId, youtubeId), eq(videos.userId, user.id)))
			.get();

		if (existingVideo) {
			return yield* new ConflictError({
				message: "Video already exists in your library",
				existingId: existingVideo.id,
			});
		}

		// Create video record with status 'pending'
		const video = db
			.insert(videos)
			.values({
				userId: user.id,
				youtubeUrl: url,
				youtubeId,
				status: "pending",
			})
			.returning()
			.get();

		// Track video_added event
		yield* analyticsService
			.trackEvent(user.id, "video_added", {
				videoId: video.id,
				youtubeId: video.youtubeId,
			})
			.pipe(Effect.catchAll(() => Effect.void)); // Don't fail on analytics errors

		// Trigger pipeline processing (fire-and-forget via forkDaemon)
		yield* Effect.forkDaemon(
			pipeline.processVideo(video.id).pipe(
				Effect.catchAll((error) =>
					Effect.logError(`Pipeline failed for video ${video.id}`, error),
				),
			),
		);

		// Return video record
		return {
			id: video.id,
			youtubeUrl: video.youtubeUrl,
			youtubeId: video.youtubeId,
			title: video.title,
			duration: video.duration,
			thumbnailUrl: video.thumbnailUrl,
			status: video.status,
			createdAt: video.createdAt.toISOString(),
			updatedAt: video.updatedAt.toISOString(),
		} satisfies typeof VideoResponse.Type;
	});

// =============================================================================
// HANDLER: listVideos
// =============================================================================

/**
 * GET /videos - List user's video library with pagination.
 *
 * Returns paginated list of videos for the authenticated user,
 * ordered by creation date (newest first).
 */
const listVideosHandler = ({
	urlParams,
}: {
	urlParams: { limit: Option.Option<number>; offset: Option.Option<number> };
}) =>
	Effect.gen(function* () {
		const user = yield* CurrentUser;
		const { db } = yield* Database;

		// Extract pagination params with defaults
		const limit = Option.getOrElse(urlParams.limit, () => 20);
		const offset = Option.getOrElse(urlParams.offset, () => 0);

		// Query user's videos with pagination
		const userVideos = db
			.select({
				id: videos.id,
				youtubeUrl: videos.youtubeUrl,
				youtubeId: videos.youtubeId,
				title: videos.title,
				duration: videos.duration,
				thumbnailUrl: videos.thumbnailUrl,
				status: videos.status,
				createdAt: videos.createdAt,
				updatedAt: videos.updatedAt,
			})
			.from(videos)
			.where(eq(videos.userId, user.id))
			.orderBy(desc(videos.createdAt))
			.limit(limit)
			.offset(offset)
			.all();

		// Map to response format with ISO timestamps
		const videoResponses = userVideos.map((video) => ({
			id: video.id,
			youtubeUrl: video.youtubeUrl,
			youtubeId: video.youtubeId,
			title: video.title,
			duration: video.duration,
			thumbnailUrl: video.thumbnailUrl,
			status: video.status,
			createdAt: video.createdAt.toISOString(),
			updatedAt: video.updatedAt.toISOString(),
		}));

		return {
			videos: videoResponses,
			limit,
			offset,
			count: videoResponses.length,
		} satisfies typeof VideoListResponse.Type;
	});

// =============================================================================
// HANDLER: getVideo
// =============================================================================

/**
 * GET /videos/:id - Get video details with transcript.
 *
 * Returns video metadata and transcript if completed.
 * Returns 404 if video doesn't exist.
 * Returns 403 if video belongs to different user.
 */
const getVideoHandler = ({ path }: { path: { id: number } }) =>
	Effect.gen(function* () {
		const videoId = path.id;
		const user = yield* CurrentUser;
		const { db } = yield* Database;

		// Fetch the video
		const video = db.select().from(videos).where(eq(videos.id, videoId)).get();

		// Return 404 if video doesn't exist
		if (!video) {
			return yield* new VideoNotFoundError({ videoId });
		}

		// Return 403 if video belongs to different user
		if (video.userId !== user.id) {
			return yield* new ForbiddenError();
		}

		// Fetch transcript if video is completed
		let transcript: typeof TranscriptResponse.Type | null = null;
		if (video.status === "completed") {
			const transcriptRecord = db
				.select()
				.from(transcripts)
				.where(eq(transcripts.videoId, videoId))
				.get();

			if (transcriptRecord) {
				transcript = {
					content: transcriptRecord.content,
					segments: transcriptRecord.segments.map((s) => ({
						start: s.start,
						end: s.end,
						text: s.text,
					})),
					language: transcriptRecord.language,
				};
			}
		}

		return {
			id: video.id,
			youtubeUrl: video.youtubeUrl,
			youtubeId: video.youtubeId,
			title: video.title,
			duration: video.duration,
			thumbnailUrl: video.thumbnailUrl,
			status: video.status,
			createdAt: video.createdAt.toISOString(),
			updatedAt: video.updatedAt.toISOString(),
			transcript,
		} satisfies typeof VideoDetailResponse.Type;
	});

// =============================================================================
// HANDLER: retryVideo
// =============================================================================

/**
 * POST /videos/:id/retry - Retry failed transcription.
 *
 * Resets a failed video to pending and re-triggers the pipeline.
 * Returns 404 if video doesn't exist.
 * Returns 403 if video belongs to different user.
 * Returns 400 if video is not in 'failed' state.
 */
const retryVideoHandler = ({ path }: { path: { id: number } }) =>
	Effect.gen(function* () {
		const videoId = path.id;
		const user = yield* CurrentUser;
		const { db } = yield* Database;
		const pipeline = yield* Pipeline;

		// Fetch the video
		const video = db.select().from(videos).where(eq(videos.id, videoId)).get();

		// Return 404 if video doesn't exist
		if (!video) {
			return yield* new VideoNotFoundError({ videoId });
		}

		// Return 403 if video belongs to different user
		if (video.userId !== user.id) {
			return yield* new ForbiddenError();
		}

		// Return 400 if video is not in 'failed' state
		if (video.status !== "failed") {
			return yield* new BadRequestError({
				message: `Can only retry videos with failed status, current status: ${video.status}`,
			});
		}

		// Reset status to 'pending'
		db.update(videos)
			.set({ status: "pending", updatedAt: new Date() })
			.where(eq(videos.id, videoId))
			.run();

		// Re-trigger pipeline processing (fire-and-forget via forkDaemon)
		yield* Effect.forkDaemon(
			pipeline.processVideo(videoId).pipe(
				Effect.catchAll((error) =>
					Effect.logError(`Pipeline retry failed for video ${videoId}`, error),
				),
			),
		);

		return {
			id: video.id,
			status: "pending" as const,
			message: "Video processing retry initiated",
		} satisfies typeof RetryVideoResponse.Type;
	});

// =============================================================================
// HANDLER: videoStatus (SSE stream)
// =============================================================================

/**
 * GET /videos/:id/status - SSE stream for processing status.
 *
 * Returns a Server-Sent Events stream with real-time processing updates.
 * Returns 404 if video doesn't exist.
 * Returns 403 if video belongs to different user.
 */
const videoStatusHandler = ({ path }: { path: { id: number } }) =>
	Effect.gen(function* () {
		const videoId = path.id;
		const user = yield* CurrentUser;
		const { db } = yield* Database;
		const progress = yield* Progress;

		// Fetch the video
		const video = db.select().from(videos).where(eq(videos.id, videoId)).get();

		// Return 404 if video doesn't exist
		if (!video) {
			return yield* new VideoNotFoundError({ videoId });
		}

		// Return 403 if video belongs to different user
		if (video.userId !== user.id) {
			return yield* new ForbiddenError();
		}

		// Create SSE stream from progress events
		const eventStream = progress.subscribe(videoId).pipe(
			// Format as SSE: data: {...}\n\n
			Stream.map((event) => `data: ${JSON.stringify(event)}\n\n`),
			// Convert to Uint8Array for streaming
			Stream.map((text) => new TextEncoder().encode(text)),
		);

		// Return SSE response
		return HttpServerResponse.stream(eventStream, {
			contentType: "text/event-stream",
			headers: {
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
			},
		});
	});

// =============================================================================
// GROUP LAYER
// =============================================================================

/**
 * Live layer providing video endpoint handlers.
 *
 * Dependencies:
 * - CurrentUser: Provided by Authorization middleware
 * - Database: For video/transcript persistence
 * - YouTube: For URL validation
 * - Pipeline: For triggering video processing
 * - Progress: For SSE status updates
 */
export const VideosGroupLive = HttpApiBuilder.group(
	YTScribeApi,
	"videos",
	(handlers) =>
		handlers
			.handle("createVideo", createVideoHandler)
			.handle("listVideos", listVideosHandler)
			.handle("getVideo", getVideoHandler)
			.handle("retryVideo", retryVideoHandler)
			.handle("videoStatus", videoStatusHandler),
);
