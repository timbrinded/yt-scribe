/**
 * Effect-TS Service Types and Conventions
 *
 * This file defines common types, interfaces, and utilities used across
 * all Effect-TS services in YTScribe.
 *
 * ============================================================================
 * NAMING CONVENTIONS
 * ============================================================================
 *
 * - FooService: The TypeScript interface describing the service shape
 * - Foo: The Context.Tag class used for dependency injection
 * - Foo.Live: Layer providing the production implementation
 * - Foo.Test: Layer providing the test/mock implementation
 *
 * Example:
 * ```typescript
 * interface DatabaseService { ... }
 * class Database extends Context.Tag("@ytscribe/Database")<Database, DatabaseService>() {
 *   static readonly Live = Layer.scoped(...)
 *   static readonly Test = Layer.succeed(...)
 * }
 * ```
 *
 * ============================================================================
 * SERVICE IDENTIFIER CONVENTION
 * ============================================================================
 *
 * All service tags use the format: "@ytscribe/ServiceName"
 * This ensures unique identifiers across the application.
 *
 * ============================================================================
 */

import type { Effect, Stream } from "effect";
import type {
	ChatApiError,
	DownloadFailedError,
	InvalidYouTubeUrlError,
	TranscriptionFailedError,
} from "../errors";

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * Pagination parameters for list queries.
 */
export interface PaginationParams {
	readonly limit: number;
	readonly offset: number;
}

/**
 * Paginated result wrapper.
 * Used for list endpoints that support pagination.
 *
 * @template T The type of items in the results array
 *
 * @example
 * ```typescript
 * const result: Paginated<Video> = {
 *   items: [video1, video2],
 *   total: 42,
 *   limit: 20,
 *   offset: 0,
 * }
 * ```
 */
export interface Paginated<T> {
	/** The items for the current page */
	readonly items: ReadonlyArray<T>;
	/** Total number of items across all pages */
	readonly total: number;
	/** Maximum items per page (from request) */
	readonly limit: number;
	/** Number of items skipped (from request) */
	readonly offset: number;
}

/**
 * Helper to check if there are more pages available.
 */
export function hasNextPage<T>(paginated: Paginated<T>): boolean {
	return paginated.offset + paginated.items.length < paginated.total;
}

/**
 * Helper to check if there's a previous page.
 */
export function hasPreviousPage<T>(paginated: Paginated<T>): boolean {
	return paginated.offset > 0;
}

// =============================================================================
// YouTube Service Types
// =============================================================================

/**
 * Metadata for a YouTube video, returned by the YouTube service.
 */
export interface VideoMetadata {
	/** YouTube video ID (11 characters) */
	readonly id: string;
	/** Video title */
	readonly title: string;
	/** Duration in seconds */
	readonly duration: number;
	/** URL to video thumbnail */
	readonly thumbnailUrl: string;
	/** Channel name */
	readonly channelName: string;
	/** Upload date in ISO format (YYYY-MM-DD) */
	readonly uploadDate: string | null;
}

/**
 * YouTube service interface.
 * Handles URL validation, metadata extraction, and audio download.
 */
export interface YouTubeService {
	/**
	 * Validates whether a URL is a valid YouTube video URL.
	 * Supports various formats: youtube.com/watch, youtu.be, /shorts/, /live/, /embed/
	 */
	readonly isValidUrl: (url: string) => boolean;

	/**
	 * Extracts the 11-character video ID from a YouTube URL.
	 * Returns null if the URL is invalid.
	 */
	readonly extractVideoId: (url: string) => string | null;

	/**
	 * Fetches video metadata from YouTube.
	 */
	readonly getMetadata: (
		url: string,
	) => Effect.Effect<VideoMetadata, InvalidYouTubeUrlError | DownloadFailedError>;

	/**
	 * Downloads audio from a YouTube video.
	 * @param url YouTube URL
	 * @param outputPath Optional output path (defaults to data/downloads/{videoId}.m4a)
	 * @returns Path to the downloaded audio file
	 */
	readonly downloadAudio: (
		url: string,
		outputPath?: string,
	) => Effect.Effect<string, InvalidYouTubeUrlError | DownloadFailedError>;
}

// =============================================================================
// Transcription Service Types
// =============================================================================

/**
 * A segment of transcribed text with timestamp information.
 */
export interface TranscriptSegment {
	/** Start time in seconds */
	readonly start: number;
	/** End time in seconds */
	readonly end: number;
	/** Transcribed text for this segment */
	readonly text: string;
}

/**
 * Result from audio transcription.
 */
export interface TranscriptionResult {
	/** Full transcribed text */
	readonly text: string;
	/** Segments with timestamps */
	readonly segments: ReadonlyArray<TranscriptSegment>;
	/** Detected language code (e.g., "en", "es") */
	readonly language: string;
	/** Audio duration in seconds */
	readonly duration: number;
}

/**
 * Transcription service interface.
 * Converts audio files to text using OpenAI Whisper.
 */
export interface TranscriptionService {
	/**
	 * Transcribes an audio file.
	 * @param filePath Path to the audio file
	 * @returns Transcription result with text and segments
	 */
	readonly transcribe: (
		filePath: string,
	) => Effect.Effect<TranscriptionResult, TranscriptionFailedError>;
}

// =============================================================================
// Chat Service Types
// =============================================================================

/**
 * Role of a message in a chat conversation.
 */
export type MessageRole = "user" | "assistant";

/**
 * A message in a chat conversation.
 */
export interface ChatMessage {
	readonly role: MessageRole;
	readonly content: string;
}

/**
 * Chat service interface.
 * Provides conversational AI powered by OpenAI GPT.
 */
export interface ChatService {
	/**
	 * Sends a message and streams the assistant's response.
	 *
	 * @param transcript The video transcript to provide as context
	 * @param messages Previous messages in the conversation
	 * @param userMessage The new user message
	 * @param videoTitle Optional video title for context
	 * @returns A stream of response chunks
	 */
	readonly chat: (
		transcript: string,
		messages: ReadonlyArray<ChatMessage>,
		userMessage: string,
		videoTitle?: string,
	) => Stream.Stream<string, ChatApiError>;

	/**
	 * Sends a message and returns the complete response.
	 * Convenience method that collects the stream into a single string.
	 */
	readonly chatComplete: (
		transcript: string,
		messages: ReadonlyArray<ChatMessage>,
		userMessage: string,
		videoTitle?: string,
	) => Effect.Effect<string, ChatApiError>;
}

// =============================================================================
// Progress Service Types
// =============================================================================

/**
 * Processing stage for video pipeline.
 */
export type ProcessingStage =
	| "pending"
	| "downloading"
	| "extracting"
	| "transcribing"
	| "complete"
	| "error";

/**
 * Progress event emitted during video processing.
 */
export interface ProgressEvent {
	/** ID of the video being processed */
	readonly videoId: number;
	/** Current processing stage */
	readonly stage: ProcessingStage;
	/** Progress percentage (0-100), if applicable */
	readonly progress?: number;
	/** Human-readable status message */
	readonly message: string;
	/** Error message if stage is "error" */
	readonly error?: string;
	/** ISO timestamp of when this event was emitted */
	readonly timestamp: string;
}

/**
 * Progress service interface.
 * Provides real-time progress updates for video processing via SSE.
 */
export interface ProgressService {
	/**
	 * Emits a progress event for a video.
	 */
	readonly emit: (event: ProgressEvent) => Effect.Effect<void>;

	/**
	 * Subscribes to progress events for a specific video.
	 * Returns a stream that emits events as they occur.
	 */
	readonly subscribe: (videoId: number) => Stream.Stream<ProgressEvent>;

	/**
	 * Subscribes to all progress events (for admin/debugging).
	 */
	readonly subscribeAll: () => Stream.Stream<ProgressEvent>;
}

// =============================================================================
// Database Service Types
// =============================================================================

/**
 * Re-export Drizzle database type for use in services.
 * The actual database instance type from bun:sqlite with Drizzle.
 */
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";

export type DrizzleDatabase = BunSQLiteDatabase<typeof schema>;

/**
 * Database service interface.
 * Provides access to the SQLite database via Drizzle ORM.
 */
export interface DatabaseService {
	/** The Drizzle database instance */
	readonly db: DrizzleDatabase;
}

// =============================================================================
// OpenAI Service Types
// =============================================================================

import type OpenAI from "openai";

/**
 * OpenAI service interface.
 * Provides access to the OpenAI client for Whisper and GPT APIs.
 */
export interface OpenAIService {
	/** The OpenAI SDK client instance */
	readonly client: OpenAI;
}

// =============================================================================
// Auth Types
// =============================================================================

/**
 * Authenticated user information.
 * Subset of the full User record, safe for client-side exposure.
 * Used by the Authorization middleware to provide CurrentUser context.
 */
export interface AuthUser {
	readonly id: number;
	readonly email: string;
	readonly name: string | null;
	readonly avatarUrl: string | null;
}

// =============================================================================
// Pipeline Service Types
// =============================================================================

/**
 * Video status enum values.
 */
export const VIDEO_STATUS = {
	PENDING: "pending",
	PROCESSING: "processing",
	COMPLETED: "completed",
	FAILED: "failed",
} as const;

export type VideoStatus = (typeof VIDEO_STATUS)[keyof typeof VIDEO_STATUS];

/**
 * Result from processing a video.
 */
export interface ProcessVideoResult {
	readonly videoId: number;
	readonly status: VideoStatus;
	readonly transcriptId?: number;
}

// =============================================================================
// Analytics Service Types
// =============================================================================

/**
 * Analytics event types that can be tracked.
 */
export type AnalyticsEventType =
	| "video_added"
	| "transcription_completed"
	| "chat_message_sent";

/**
 * Analytics event properties - varies by event type.
 */
export type AnalyticsProperties = Record<string, unknown>;

/**
 * Recorded analytics event as stored in the database.
 */
export interface AnalyticsRecord {
	readonly id: number;
	readonly userId: number;
	readonly event: AnalyticsEventType;
	readonly properties: AnalyticsProperties | null;
	readonly createdAt: Date;
}

/**
 * Analytics service interface.
 * Provides event tracking for user activity monitoring.
 */
export interface AnalyticsService {
	/**
	 * Tracks an analytics event.
	 *
	 * @param userId The ID of the user performing the action
	 * @param event The type of event being tracked
	 * @param properties Optional additional properties about the event
	 */
	readonly trackEvent: (
		userId: number,
		event: AnalyticsEventType,
		properties?: AnalyticsProperties,
	) => Effect.Effect<void>;

	/**
	 * Retrieves analytics events with optional filtering.
	 *
	 * @param options Query options (userId filter, pagination, date range)
	 */
	readonly getEvents: (options?: {
		userId?: number;
		event?: AnalyticsEventType;
		limit?: number;
		offset?: number;
	}) => Effect.Effect<Paginated<AnalyticsRecord>>;
}
