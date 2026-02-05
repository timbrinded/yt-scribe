/**
 * YouTube Effect Service
 *
 * Provides YouTube URL validation, video metadata extraction, and audio download.
 * This is a leaf service with no Effect-TS service dependencies.
 *
 * Uses Bun.spawn to shell out to yt-dlp for metadata and audio download.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const youtube = yield* YouTube
 *
 *   // Validate URL (pure function, synchronous)
 *   if (!youtube.isValidUrl("https://youtube.com/watch?v=abc123")) {
 *     return yield* Effect.fail(new InvalidYouTubeUrlError({ url: "..." }))
 *   }
 *
 *   // Get metadata (effectful, may fail)
 *   const metadata = yield* youtube.getMetadata("https://youtube.com/watch?v=abc123")
 *
 *   // Download audio (effectful, may fail)
 *   const audioPath = yield* youtube.downloadAudio("https://youtube.com/watch?v=abc123")
 *
 *   return { metadata, audioPath }
 * })
 *
 * // Run with live implementation
 * await Effect.runPromise(program.pipe(Effect.provide(YouTube.Live)))
 * ```
 */

import { Context, Effect, Layer } from "effect";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DownloadFailedError, InvalidYouTubeUrlError } from "../errors";
import type { YouTubeService, VideoMetadata } from "./types";

// =============================================================================
// CONSTANTS AND PATTERNS
// =============================================================================

/**
 * Supported YouTube URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * - With additional query parameters (e.g., &t=123, &list=PLxxx)
 */
const YOUTUBE_URL_PATTERNS = [
	// Standard watch URLs: youtube.com/watch?v=ID (ID followed by & or end)
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})(?:&|$)/,
	// Short URLs: youtu.be/ID (ID followed by ? or end)
	/^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	// Embed URLs: youtube.com/embed/ID (ID followed by ? or end)
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	// Old embed URLs: youtube.com/v/ID (ID followed by ? or end)
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	// Shorts URLs: youtube.com/shorts/ID (ID followed by ? or end)
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	// Live URLs: youtube.com/live/ID (ID followed by ? or end)
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
];

/** Default directory for downloaded audio files */
const DEFAULT_DOWNLOADS_DIR = "data/downloads";

// =============================================================================
// PURE FUNCTIONS (synchronous)
// =============================================================================

/**
 * Validates if a string is a valid YouTube URL.
 * @param url - The URL to validate
 * @returns true if the URL is a valid YouTube video URL
 */
function isValidYouTubeUrl(url: string): boolean {
	return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Extracts the video ID from a YouTube URL.
 * @param url - The YouTube URL
 * @returns The video ID or null if the URL is invalid
 */
function extractVideoId(url: string): string | null {
	for (const pattern of YOUTUBE_URL_PATTERNS) {
		const match = url.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}
	return null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gets yt-dlp cookie arguments based on environment configuration.
 * Supports YT_COOKIES_BROWSER (e.g., "firefox", "chrome") or YT_COOKIES_FILE (path to cookies.txt)
 */
function getCookieArgs(): string[] {
	const browser = process.env.YT_COOKIES_BROWSER;
	const cookieFile = process.env.YT_COOKIES_FILE;

	if (browser) {
		return ["--cookies-from-browser", browser];
	}
	if (cookieFile) {
		return ["--cookies", cookieFile];
	}
	return [];
}

/**
 * Interface for yt-dlp JSON output (subset of fields we use)
 */
interface YtDlpOutput {
	id: string;
	title: string;
	duration: number;
	thumbnail: string;
	channel: string;
	upload_date: string;
}

// =============================================================================
// EFFECTFUL FUNCTIONS
// =============================================================================

/**
 * Fetches video metadata using yt-dlp, wrapped in Effect.
 */
function getVideoMetadata(
	url: string,
): Effect.Effect<VideoMetadata, InvalidYouTubeUrlError | DownloadFailedError> {
	return Effect.gen(function* () {
		// Validate URL first
		if (!isValidYouTubeUrl(url)) {
			return yield* new InvalidYouTubeUrlError({ url });
		}

		// Shell out to yt-dlp
		const result = yield* Effect.tryPromise({
			try: async () => {
				const proc = Bun.spawn(
					[
						"yt-dlp",
						...getCookieArgs(),
						"--dump-json",
						"--no-download",
						"--no-warnings",
						"--no-playlist",
						url,
					],
					{
						stdout: "pipe",
						stderr: "pipe",
					},
				);

				const [stdout, stderr] = await Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
				]);

				const exitCode = await proc.exited;

				return { stdout, stderr, exitCode };
			},
			catch: (error) =>
				new DownloadFailedError({
					youtubeUrl: url,
					reason: error instanceof Error ? error.message : String(error),
				}),
		});

		// Check for yt-dlp errors
		if (result.exitCode !== 0) {
			const errorMessage = result.stderr.trim() || "Unknown yt-dlp error";
			return yield* new DownloadFailedError({
				youtubeUrl: url,
				reason: errorMessage,
			});
		}

		// Parse JSON output
		const parseResult = yield* Effect.try({
			try: () => JSON.parse(result.stdout) as YtDlpOutput,
			catch: (error) =>
				new DownloadFailedError({
					youtubeUrl: url,
					reason: `Failed to parse yt-dlp output: ${error instanceof Error ? error.message : String(error)}`,
				}),
		});

		return {
			id: parseResult.id,
			title: parseResult.title,
			duration: parseResult.duration,
			thumbnailUrl: parseResult.thumbnail,
			channelName: parseResult.channel,
			uploadDate: parseResult.upload_date,
		} satisfies VideoMetadata;
	});
}

/**
 * Downloads audio from a YouTube video using yt-dlp, wrapped in Effect.
 */
function downloadAudioEffect(
	url: string,
	outputPath?: string,
): Effect.Effect<string, InvalidYouTubeUrlError | DownloadFailedError> {
	return Effect.gen(function* () {
		// Extract video ID (validates URL implicitly)
		const videoId = extractVideoId(url);
		if (!videoId) {
			return yield* new InvalidYouTubeUrlError({ url });
		}

		// Determine output path
		const finalOutputPath =
			outputPath ?? join(DEFAULT_DOWNLOADS_DIR, `${videoId}.m4a`);

		// Ensure the output directory exists
		const outputDir = dirname(finalOutputPath);
		if (!existsSync(outputDir)) {
			mkdirSync(outputDir, { recursive: true });
		}

		// Shell out to yt-dlp
		const result = yield* Effect.tryPromise({
			try: async () => {
				const proc = Bun.spawn(
					[
						"yt-dlp",
						...getCookieArgs(),
						"--extract-audio",
						"--audio-format",
						"m4a",
						"--audio-quality",
						"0", // Best quality
						"--no-warnings",
						"--no-playlist",
						"-o",
						finalOutputPath,
						url,
					],
					{
						stdout: "pipe",
						stderr: "pipe",
					},
				);

				const [stdout, stderr] = await Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
				]);

				const exitCode = await proc.exited;

				return { stdout, stderr, exitCode };
			},
			catch: (error) =>
				new DownloadFailedError({
					youtubeUrl: url,
					reason: error instanceof Error ? error.message : String(error),
				}),
		});

		// Check for yt-dlp errors
		if (result.exitCode !== 0) {
			const errorMessage =
				result.stderr.trim() || result.stdout.trim() || "Unknown yt-dlp error";
			return yield* new DownloadFailedError({
				youtubeUrl: url,
				reason: errorMessage,
			});
		}

		// Verify the file was created
		const fileExists = yield* Effect.tryPromise({
			try: async () => {
				const file = Bun.file(finalOutputPath);
				return await file.exists();
			},
			catch: (error) =>
				new DownloadFailedError({
					youtubeUrl: url,
					reason: `Failed to check output file: ${error instanceof Error ? error.message : String(error)}`,
				}),
		});

		if (!fileExists) {
			return yield* new DownloadFailedError({
				youtubeUrl: url,
				reason: `Audio file was not created at: ${finalOutputPath}`,
			});
		}

		return finalOutputPath;
	});
}

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * YouTube service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const youtube = yield* YouTube
 *
 * // Synchronous URL validation
 * const isValid = youtube.isValidUrl(url)
 * const videoId = youtube.extractVideoId(url)
 *
 * // Effectful operations
 * const metadata = yield* youtube.getMetadata(url)
 * const audioPath = yield* youtube.downloadAudio(url)
 * ```
 */
export class YouTube extends Context.Tag("@ytscribe/YouTube")<
	YouTube,
	YouTubeService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that uses yt-dlp for YouTube operations.
	 *
	 * Requires yt-dlp to be installed and available in PATH.
	 * Optionally uses YT_COOKIES_BROWSER or YT_COOKIES_FILE for cookie authentication.
	 */
	static readonly Live = Layer.sync(YouTube, () => ({
		isValidUrl: isValidYouTubeUrl,
		extractVideoId,
		getMetadata: getVideoMetadata,
		downloadAudio: downloadAudioEffect,
	}));

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer with mock implementations.
	 *
	 * By default, URL validation works normally but getMetadata and downloadAudio
	 * return errors. Use makeYouTubeTestLayer() for custom mock implementations.
	 */
	static readonly Test = Layer.succeed(YouTube, {
		isValidUrl: isValidYouTubeUrl,
		extractVideoId,
		getMetadata: (url: string) =>
			isValidYouTubeUrl(url)
				? Effect.fail(
						new DownloadFailedError({
							youtubeUrl: url,
							reason:
								"Mock: getMetadata not implemented. Use makeYouTubeTestLayer() to provide implementation.",
						}),
					)
				: Effect.fail(new InvalidYouTubeUrlError({ url })),
		downloadAudio: (url: string) =>
			isValidYouTubeUrl(url)
				? Effect.fail(
						new DownloadFailedError({
							youtubeUrl: url,
							reason:
								"Mock: downloadAudio not implemented. Use makeYouTubeTestLayer() to provide implementation.",
						}),
					)
				: Effect.fail(new InvalidYouTubeUrlError({ url })),
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
 * const testLayer = makeYouTubeTestLayer({
 *   getMetadata: (url) => Effect.succeed({
 *     id: "test123",
 *     title: "Test Video",
 *     duration: 60,
 *     thumbnailUrl: "https://example.com/thumb.jpg",
 *     channelName: "Test Channel",
 *     uploadDate: "2024-01-01",
 *   }),
 *   downloadAudio: (url) => Effect.succeed("/tmp/test.m4a"),
 * })
 *
 * const program = Effect.gen(function* () {
 *   const youtube = yield* YouTube
 *   return yield* youtube.getMetadata("https://youtube.com/watch?v=test123")
 * })
 *
 * const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
 * // result = { id: "test123", title: "Test Video", ... }
 * ```
 */
export function makeYouTubeTestLayer(
	overrides: Partial<YouTubeService>,
): Layer.Layer<YouTube> {
	return Layer.succeed(YouTube, {
		isValidUrl: overrides.isValidUrl ?? isValidYouTubeUrl,
		extractVideoId: overrides.extractVideoId ?? extractVideoId,
		getMetadata:
			overrides.getMetadata ??
			((url: string) =>
				isValidYouTubeUrl(url)
					? Effect.fail(
							new DownloadFailedError({
								youtubeUrl: url,
								reason: "Mock: getMetadata not implemented",
							}),
						)
					: Effect.fail(new InvalidYouTubeUrlError({ url }))),
		downloadAudio:
			overrides.downloadAudio ??
			((url: string) =>
				isValidYouTubeUrl(url)
					? Effect.fail(
							new DownloadFailedError({
								youtubeUrl: url,
								reason: "Mock: downloadAudio not implemented",
							}),
						)
					: Effect.fail(new InvalidYouTubeUrlError({ url }))),
	});
}
