#!/usr/bin/env bun
import cac from "cac";
import { ApiClient, ApiRequestError } from "./api";
import { getSessionToken } from "./credentials";

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
	}
	return `${minutes}:${String(secs).padStart(2, "0")}`;
}

const cli = cac("ytscribe");

// Version from package.json would be loaded dynamically in production
cli.version("0.1.0");

// Add command - queue video for processing
cli
	.command("add <url>", "Add a YouTube video to your library for transcription")
	.action(async (url: string) => {
		const sessionToken = getSessionToken();

		if (!sessionToken) {
			console.error("Error: Not authenticated. Please run 'ytscribe login' first.");
			process.exit(1);
		}

		const client = new ApiClient();
		client.setSessionToken(sessionToken);

		try {
			const video = await client.addVideo(url);
			console.log("Video added successfully!");
			console.log(`  ID: ${video.id}`);
			console.log(`  YouTube ID: ${video.youtubeId}`);
			console.log(`  Status: ${video.status}`);
			console.log(`  Created: ${video.createdAt}`);
		} catch (error) {
			if (error instanceof ApiRequestError) {
				if (error.statusCode === 401) {
					console.error("Error: Session expired. Please run 'ytscribe login' again.");
				} else if (error.statusCode === 409) {
					console.error(`Error: This video is already in your library (ID: ${error.response.existingVideoId})`);
				} else if (error.statusCode === 400) {
					console.error(`Error: Invalid YouTube URL`);
				} else {
					console.error(`Error: ${error.message}`);
				}
				process.exit(1);
			}
			throw error;
		}
	});

// List command - show video library
cli
	.command("list", "List all videos in your library")
	.option("--status <status>", "Filter by status (pending, processing, completed, failed)")
	.action(async (options: { status?: string }) => {
		const sessionToken = getSessionToken();

		if (!sessionToken) {
			console.error("Error: Not authenticated. Please run 'ytscribe login' first.");
			process.exit(1);
		}

		const client = new ApiClient();
		client.setSessionToken(sessionToken);

		try {
			const result = await client.listVideos({ limit: 100 });

			// Filter by status if provided
			let filteredVideos = result.videos;
			if (options.status) {
				const validStatuses = ["pending", "processing", "completed", "failed"];
				if (!validStatuses.includes(options.status)) {
					console.error(`Error: Invalid status. Must be one of: ${validStatuses.join(", ")}`);
					process.exit(1);
				}
				filteredVideos = filteredVideos.filter((v) => v.status === options.status);
			}

			if (filteredVideos.length === 0) {
				if (options.status) {
					console.log(`No videos with status '${options.status}' found.`);
				} else {
					console.log("No videos in your library. Use 'ytscribe add <url>' to add one.");
				}
				return;
			}

			// Calculate column widths
			const idWidth = Math.max(2, ...filteredVideos.map((v) => String(v.id).length));
			const titleWidth = Math.min(40, Math.max(5, ...filteredVideos.map((v) => (v.title || v.youtubeId).length)));
			const statusWidth = Math.max(6, ...filteredVideos.map((v) => v.status.length));
			const durationWidth = 8;
			const dateWidth = 10;

			// Print header
			const header = [
				"ID".padEnd(idWidth),
				"Title".padEnd(titleWidth),
				"Status".padEnd(statusWidth),
				"Duration".padEnd(durationWidth),
				"Added".padEnd(dateWidth),
			].join("  ");
			console.log(header);
			console.log("-".repeat(header.length));

			// Print rows
			for (const video of filteredVideos) {
				const title = video.title || video.youtubeId;
				const truncatedTitle = title.length > titleWidth ? title.slice(0, titleWidth - 3) + "..." : title;
				const duration = video.duration ? formatDuration(video.duration) : "-";
				const date = new Date(video.createdAt).toISOString().slice(0, 10);

				const row = [
					String(video.id).padEnd(idWidth),
					truncatedTitle.padEnd(titleWidth),
					video.status.padEnd(statusWidth),
					duration.padStart(durationWidth),
					date.padEnd(dateWidth),
				].join("  ");
				console.log(row);
			}

			console.log("");
			console.log(`Total: ${filteredVideos.length} video${filteredVideos.length !== 1 ? "s" : ""}`);
		} catch (error) {
			if (error instanceof ApiRequestError) {
				if (error.statusCode === 401) {
					console.error("Error: Session expired. Please run 'ytscribe login' again.");
				} else {
					console.error(`Error: ${error.message}`);
				}
				process.exit(1);
			}
			throw error;
		}
	});

// Chat command - interactive conversation with video transcript
cli
	.command("chat <video-id>", "Start an interactive chat session about a video")
	.action((videoId: string) => {
		console.log(`Starting chat for video: ${videoId}`);
		console.log("(Not yet implemented)");
	});

// Login command - OAuth authentication
cli
	.command("login", "Authenticate with your account via Google OAuth")
	.action(() => {
		console.log("Starting login flow...");
		console.log("(Not yet implemented)");
	});

// Logout command - clear credentials
cli
	.command("logout", "Clear stored credentials")
	.action(() => {
		console.log("Logging out...");
		console.log("(Not yet implemented)");
	});

// Help is automatically included by CAC
cli.help();

// Parse command line arguments
cli.parse();
