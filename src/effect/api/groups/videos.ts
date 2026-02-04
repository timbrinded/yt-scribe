/**
 * Effect-TS HttpApiGroup for Video Endpoints
 *
 * Defines all video-related API endpoints:
 * - POST /videos - Add a new video for transcription
 * - GET /videos - List user's video library
 * - GET /videos/:id - Get video details with transcript
 * - POST /videos/:id/retry - Retry failed transcription
 * - GET /videos/:id/status - SSE stream for processing status
 *
 * All endpoints require authentication via the Authorization middleware.
 */

import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	InvalidYouTubeUrlError,
	VideoNotFoundError,
} from "../../errors";
import { Authorization } from "../middleware/auth";

// =============================================================================
// REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Request body for creating a new video.
 */
export class CreateVideoRequest extends Schema.Class<CreateVideoRequest>(
	"CreateVideoRequest",
)({
	url: Schema.String.pipe(
		Schema.annotations({
			description: "YouTube video URL (supports youtube.com, youtu.be, shorts, etc.)",
			examples: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
		}),
	),
}) {}

/**
 * Response when a video is created.
 */
export class VideoResponse extends Schema.Class<VideoResponse>("VideoResponse")({
	id: Schema.Number.pipe(Schema.annotations({ description: "Video ID in the database" })),
	youtubeUrl: Schema.String.pipe(Schema.annotations({ description: "Original YouTube URL" })),
	youtubeId: Schema.String.pipe(Schema.annotations({ description: "YouTube video ID (11 characters)" })),
	title: Schema.NullOr(Schema.String).pipe(Schema.annotations({ description: "Video title (null if not yet fetched)" })),
	duration: Schema.NullOr(Schema.Number).pipe(Schema.annotations({ description: "Duration in seconds" })),
	thumbnailUrl: Schema.NullOr(Schema.String).pipe(Schema.annotations({ description: "Thumbnail URL" })),
	status: Schema.Literal("pending", "processing", "completed", "failed").pipe(
		Schema.annotations({ description: "Processing status" }),
	),
	createdAt: Schema.String.pipe(Schema.annotations({ description: "ISO timestamp when video was added" })),
	updatedAt: Schema.String.pipe(Schema.annotations({ description: "ISO timestamp of last update" })),
}) {}

/**
 * A segment of the transcript with timestamps.
 */
export class TranscriptSegmentSchema extends Schema.Class<TranscriptSegmentSchema>(
	"TranscriptSegmentSchema",
)({
	start: Schema.Number.pipe(Schema.annotations({ description: "Start time in seconds" })),
	end: Schema.Number.pipe(Schema.annotations({ description: "End time in seconds" })),
	text: Schema.String.pipe(Schema.annotations({ description: "Transcribed text for this segment" })),
}) {}

/**
 * Transcript data included with video details.
 */
export class TranscriptResponse extends Schema.Class<TranscriptResponse>(
	"TranscriptResponse",
)({
	content: Schema.String.pipe(Schema.annotations({ description: "Full transcript text" })),
	segments: Schema.Array(TranscriptSegmentSchema).pipe(
		Schema.annotations({ description: "Transcript segments with timestamps" }),
	),
	language: Schema.String.pipe(Schema.annotations({ description: "Detected language code" })),
}) {}

/**
 * Response for video details including transcript.
 */
export class VideoDetailResponse extends Schema.Class<VideoDetailResponse>(
	"VideoDetailResponse",
)({
	id: Schema.Number,
	youtubeUrl: Schema.String,
	youtubeId: Schema.String,
	title: Schema.NullOr(Schema.String),
	duration: Schema.NullOr(Schema.Number),
	thumbnailUrl: Schema.NullOr(Schema.String),
	status: Schema.Literal("pending", "processing", "completed", "failed"),
	createdAt: Schema.String,
	updatedAt: Schema.String,
	transcript: Schema.NullOr(TranscriptResponse).pipe(
		Schema.annotations({ description: "Transcript data (null if not yet completed)" }),
	),
}) {}

/**
 * Response for video list endpoint.
 */
export class VideoListResponse extends Schema.Class<VideoListResponse>(
	"VideoListResponse",
)({
	videos: Schema.Array(VideoResponse),
	limit: Schema.Number.pipe(Schema.annotations({ description: "Maximum items per page" })),
	offset: Schema.Number.pipe(Schema.annotations({ description: "Items skipped" })),
	count: Schema.Number.pipe(Schema.annotations({ description: "Number of items returned" })),
}) {}

/**
 * Response for retry endpoint.
 */
export class RetryVideoResponse extends Schema.Class<RetryVideoResponse>(
	"RetryVideoResponse",
)({
	id: Schema.Number,
	status: Schema.Literal("pending"),
	message: Schema.String,
}) {}

/**
 * Query parameters for video list endpoint.
 * URL params must encode to strings, so we use Schema.optional with { as: "Option" }
 * pattern that works with HttpApi URL params.
 */
export const VideoListParams = Schema.Struct({
	limit: Schema.optionalWith(
		Schema.NumberFromString.pipe(
			Schema.int(),
			Schema.between(1, 100),
			Schema.annotations({ description: "Maximum items per page (1-100, default 20)" }),
		),
		{ as: "Option" },
	),
	offset: Schema.optionalWith(
		Schema.NumberFromString.pipe(
			Schema.int(),
			Schema.nonNegative(),
			Schema.annotations({ description: "Number of items to skip (default 0)" }),
		),
		{ as: "Option" },
	),
});

/**
 * Path parameters for video endpoints.
 */
export class VideoIdParam extends Schema.Class<VideoIdParam>("VideoIdParam")({
	id: Schema.NumberFromString.pipe(
		Schema.int(),
		Schema.positive(),
		Schema.annotations({ description: "Video ID" }),
	),
}) {}

// =============================================================================
// ENDPOINT DEFINITIONS
// =============================================================================

/**
 * POST /videos - Create a new video for transcription.
 *
 * Validates the YouTube URL, checks for duplicates, creates a video record,
 * and triggers the transcription pipeline.
 */
const createVideo = HttpApiEndpoint.post("createVideo", "/videos")
	.setPayload(CreateVideoRequest)
	.addSuccess(VideoResponse, { status: 201 })
	.addError(InvalidYouTubeUrlError)
	.addError(ConflictError)
	.annotate(OpenApi.Summary, "Add a new video for transcription")
	.annotate(
		OpenApi.Description,
		"Validates the YouTube URL, creates a video record with status 'pending', and triggers the transcription pipeline in the background.",
	);

/**
 * GET /videos - List user's video library.
 *
 * Returns paginated list of videos for the authenticated user.
 */
const listVideos = HttpApiEndpoint.get("listVideos", "/videos")
	.setUrlParams(VideoListParams)
	.addSuccess(VideoListResponse)
	.annotate(OpenApi.Summary, "List user's video library")
	.annotate(OpenApi.Description, "Returns a paginated list of videos belonging to the authenticated user, ordered by creation date (newest first).");

/**
 * GET /videos/:id - Get video details with transcript.
 *
 * Returns video metadata and transcript if completed.
 */
const getVideo = HttpApiEndpoint.get("getVideo", "/videos/:id")
	.setPath(VideoIdParam)
	.addSuccess(VideoDetailResponse)
	.addError(VideoNotFoundError)
	.addError(ForbiddenError)
	.annotate(OpenApi.Summary, "Get video details")
	.annotate(OpenApi.Description, "Returns video metadata and transcript content. Transcript is null for non-completed videos.");

/**
 * POST /videos/:id/retry - Retry failed transcription.
 *
 * Resets a failed video to pending and re-triggers the pipeline.
 */
const retryVideo = HttpApiEndpoint.post("retryVideo", "/videos/:id/retry")
	.setPath(VideoIdParam)
	.addSuccess(RetryVideoResponse)
	.addError(VideoNotFoundError)
	.addError(ForbiddenError)
	.addError(BadRequestError)
	.annotate(OpenApi.Summary, "Retry failed transcription")
	.annotate(OpenApi.Description, "Resets a video in 'failed' state back to 'pending' and re-triggers the transcription pipeline. Returns 400 if video is not in failed state.");

/**
 * GET /videos/:id/status - SSE stream for processing status.
 *
 * Returns a Server-Sent Events stream with real-time processing updates.
 * Note: This endpoint returns a streaming response, not JSON.
 */
const videoStatus = HttpApiEndpoint.get("videoStatus", "/videos/:id/status")
	.setPath(VideoIdParam)
	.addError(VideoNotFoundError)
	.addError(ForbiddenError)
	.annotate(OpenApi.Summary, "Stream video processing status")
	.annotate(OpenApi.Description, "Server-Sent Events stream providing real-time updates during video processing. Events include stage changes (downloading, extracting, transcribing, complete, error) and progress percentages.");

// =============================================================================
// GROUP DEFINITION
// =============================================================================

/**
 * Videos API group.
 *
 * All endpoints require authentication via the Authorization middleware.
 * Protected endpoints validate that the video belongs to the authenticated user.
 */
export const VideosGroup = HttpApiGroup.make("videos")
	.add(createVideo)
	.add(listVideos)
	.add(getVideo)
	.add(retryVideo)
	.add(videoStatus)
	.middleware(Authorization)
	.prefix("/api")
	.annotate(OpenApi.Title, "Videos")
	.annotate(OpenApi.Description, "Video management and transcription endpoints");
