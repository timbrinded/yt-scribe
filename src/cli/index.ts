#!/usr/bin/env bun
import cac from "cac";
import { ApiClient, ApiRequestError } from "./api";
import { getSessionToken } from "./credentials";

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
	.action((options: { status?: string }) => {
		console.log("Listing videos...");
		if (options.status) {
			console.log(`Filtering by status: ${options.status}`);
		}
		console.log("(Not yet implemented)");
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
