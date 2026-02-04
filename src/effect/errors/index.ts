/**
 * Effect-TS Error Types
 *
 * Typed error classes for the YTScribe API using Effect's Schema.TaggedError pattern.
 * These errors integrate with HttpApi to automatically set HTTP response status codes.
 *
 * Pattern:
 * - Schema.TaggedError for errors with data payloads (video ID, error messages)
 * - HttpApiSchema.EmptyError for simple HTTP status errors (401, 403)
 *
 * The _tag field enables pattern matching in error handlers.
 */

import * as Schema from "effect/Schema";
import * as HttpApiSchema from "@effect/platform/HttpApiSchema";

// =============================================================================
// Application Domain Errors (with data payloads)
// =============================================================================

/**
 * Video not found in database.
 * Used when a video ID doesn't exist or doesn't belong to the user.
 */
export class VideoNotFoundError extends Schema.TaggedError<VideoNotFoundError>()(
	"VideoNotFoundError",
	{
		videoId: Schema.Number,
		message: Schema.optional(Schema.String),
	},
	HttpApiSchema.annotations({ status: 404 }),
) {
	get displayMessage(): string {
		return this.message ?? `Video with ID ${this.videoId} not found`;
	}
}

/**
 * YouTube video download failed.
 * Wraps yt-dlp errors with context about what URL was being downloaded.
 */
export class DownloadFailedError extends Schema.TaggedError<DownloadFailedError>()(
	"DownloadFailedError",
	{
		youtubeUrl: Schema.String,
		reason: Schema.String,
	},
	HttpApiSchema.annotations({ status: 500 }),
) {
	get displayMessage(): string {
		return `Failed to download video from ${this.youtubeUrl}: ${this.reason}`;
	}
}

/**
 * Audio transcription failed.
 * Wraps OpenAI Whisper API errors with context.
 */
export class TranscriptionFailedError extends Schema.TaggedError<TranscriptionFailedError>()(
	"TranscriptionFailedError",
	{
		videoId: Schema.Number,
		reason: Schema.String,
	},
	HttpApiSchema.annotations({ status: 500 }),
) {
	get displayMessage(): string {
		return `Transcription failed for video ${this.videoId}: ${this.reason}`;
	}
}

/**
 * Database operation failed.
 * Used for unrecoverable database errors.
 */
export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
	"DatabaseError",
	{
		operation: Schema.String,
		reason: Schema.String,
	},
	HttpApiSchema.annotations({ status: 500 }),
) {
	get displayMessage(): string {
		return `Database ${this.operation} failed: ${this.reason}`;
	}
}

/**
 * Chat API call failed.
 * Wraps OpenAI chat completions API errors.
 */
export class ChatApiError extends Schema.TaggedError<ChatApiError>()(
	"ChatApiError",
	{
		reason: Schema.String,
		retryable: Schema.Boolean,
	},
	HttpApiSchema.annotations({ status: 502 }),
) {
	get displayMessage(): string {
		return `Chat API error: ${this.reason}`;
	}
}

/**
 * Invalid YouTube URL provided.
 * Used when URL validation fails.
 */
export class InvalidYouTubeUrlError extends Schema.TaggedError<InvalidYouTubeUrlError>()(
	"InvalidYouTubeUrlError",
	{
		url: Schema.String,
	},
	HttpApiSchema.annotations({ status: 400 }),
) {
	get displayMessage(): string {
		return `Invalid YouTube URL: ${this.url}`;
	}
}

// =============================================================================
// HTTP Authentication/Authorization Errors (simple status errors)
// =============================================================================

/**
 * User is not authenticated.
 * Used when session is missing or invalid.
 */
export class UnauthorizedError extends HttpApiSchema.EmptyError<UnauthorizedError>()(
	{
		tag: "UnauthorizedError",
		status: 401,
	},
) {}

/**
 * User is authenticated but doesn't have permission.
 * Used when accessing another user's resources.
 */
export class ForbiddenError extends HttpApiSchema.EmptyError<ForbiddenError>()({
	tag: "ForbiddenError",
	status: 403,
}) {}

/**
 * Video is already being processed or exists.
 * Used for duplicate video detection.
 */
export class ConflictError extends Schema.TaggedError<ConflictError>()(
	"ConflictError",
	{
		message: Schema.String,
		existingId: Schema.optional(Schema.Number),
	},
	HttpApiSchema.annotations({ status: 409 }),
) {
	get displayMessage(): string {
		return this.message;
	}
}

/**
 * Invalid request data.
 * Used for validation errors not covered by other types.
 */
export class BadRequestError extends Schema.TaggedError<BadRequestError>()(
	"BadRequestError",
	{
		message: Schema.String,
	},
	HttpApiSchema.annotations({ status: 400 }),
) {
	get displayMessage(): string {
		return this.message;
	}
}

// =============================================================================
// Union Types for Service Boundaries
// =============================================================================

/**
 * All errors that can occur in the YouTube service.
 */
export type YouTubeServiceError = InvalidYouTubeUrlError | DownloadFailedError;

/**
 * All errors that can occur in the Transcription service.
 */
export type TranscriptionServiceError = TranscriptionFailedError;

/**
 * All errors that can occur in the Chat service.
 */
export type ChatServiceError = ChatApiError;

/**
 * All errors that can occur in the Pipeline service.
 */
export type PipelineServiceError =
	| VideoNotFoundError
	| DownloadFailedError
	| TranscriptionFailedError
	| DatabaseError;

/**
 * All authentication-related errors.
 */
export type AuthError = UnauthorizedError | ForbiddenError;

/**
 * All API-level errors (for endpoint handlers).
 */
export type ApiError =
	| VideoNotFoundError
	| InvalidYouTubeUrlError
	| ConflictError
	| BadRequestError
	| UnauthorizedError
	| ForbiddenError
	| DatabaseError
	| ChatApiError;
