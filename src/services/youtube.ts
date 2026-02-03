import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { logger } from "../utils/logger";

/**
 * YouTube URL validation, metadata extraction, and audio download service
 * Uses yt-dlp for fetching video metadata and downloading audio
 */

export interface VideoMetadata {
	id: string;
	title: string;
	duration: number;
	thumbnailUrl: string;
	channelName: string;
	uploadDate: string;
}

/**
 * Supported YouTube URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
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

/**
 * Validates if a string is a valid YouTube URL
 * @param url - The URL to validate
 * @returns true if the URL is a valid YouTube video URL
 */
export function isValidYouTubeUrl(url: string): boolean {
	return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Extracts the video ID from a YouTube URL
 * @param url - The YouTube URL
 * @returns The video ID or null if the URL is invalid
 */
export function extractVideoId(url: string): string | null {
	for (const pattern of YOUTUBE_URL_PATTERNS) {
		const match = url.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}
	return null;
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

/**
 * Fetches video metadata using yt-dlp
 * @param url - The YouTube URL
 * @returns Video metadata including title, duration, thumbnail, etc.
 * @throws Error if yt-dlp fails or URL is invalid
 */
export async function getVideoMetadata(url: string): Promise<VideoMetadata> {
	if (!isValidYouTubeUrl(url)) {
		throw new Error(`Invalid YouTube URL: ${url}`);
	}

	const proc = Bun.spawn(
		[
			"yt-dlp",
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

	if (exitCode !== 0) {
		const errorMessage = stderr.trim() || "Unknown yt-dlp error";
		logger.error({ url, exitCode, stderr: errorMessage }, "yt-dlp metadata fetch failed");
		throw new Error(`Failed to fetch video metadata: ${errorMessage}`);
	}

	const data: YtDlpOutput = JSON.parse(stdout);

	logger.debug(
		{ videoId: data.id, title: data.title, duration: data.duration },
		"Fetched video metadata",
	);

	return {
		id: data.id,
		title: data.title,
		duration: data.duration,
		thumbnailUrl: data.thumbnail,
		channelName: data.channel,
		uploadDate: data.upload_date,
	};
}

/**
 * Default directory for downloaded audio files
 */
const DEFAULT_DOWNLOADS_DIR = "data/downloads";

/**
 * Downloads audio from a YouTube video using yt-dlp
 * @param youtubeUrl - The YouTube URL to download
 * @param outputPath - Optional custom output path. If not provided, uses data/downloads/{videoId}.m4a
 * @returns The path to the downloaded audio file
 * @throws Error if yt-dlp fails or URL is invalid
 */
export async function downloadAudio(
	youtubeUrl: string,
	outputPath?: string,
): Promise<string> {
	const videoId = extractVideoId(youtubeUrl);
	if (!videoId) {
		throw new Error(`Invalid YouTube URL: ${youtubeUrl}`);
	}

	// Determine output path
	const finalOutputPath =
		outputPath ?? join(DEFAULT_DOWNLOADS_DIR, `${videoId}.m4a`);

	// Ensure the output directory exists
	const outputDir = dirname(finalOutputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const proc = Bun.spawn(
		[
			"yt-dlp",
			"--extract-audio",
			"--audio-format",
			"m4a",
			"--audio-quality",
			"0", // Best quality
			"--no-warnings",
			"--no-playlist",
			"-o",
			finalOutputPath,
			youtubeUrl,
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

	if (exitCode !== 0) {
		const errorMessage =
			stderr.trim() || stdout.trim() || "Unknown yt-dlp error";
		logger.error(
			{ videoId, youtubeUrl, exitCode, stderr: errorMessage },
			"yt-dlp audio download failed",
		);
		throw new Error(`Failed to download audio: ${errorMessage}`);
	}

	// Verify the file was created
	const file = Bun.file(finalOutputPath);
	if (!(await file.exists())) {
		logger.error({ videoId, outputPath: finalOutputPath }, "Audio file not created");
		throw new Error(`Audio file was not created at: ${finalOutputPath}`);
	}

	const fileSize = file.size;
	logger.info(
		{ videoId, outputPath: finalOutputPath, fileSizeMB: (fileSize / 1024 / 1024).toFixed(2) },
		"Audio download completed",
	);

	return finalOutputPath;
}
