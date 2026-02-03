#!/usr/bin/env bun
import cac from "cac";

const cli = cac("ytscribe");

// Version from package.json would be loaded dynamically in production
cli.version("0.1.0");

// Add command - queue video for processing
cli
	.command("add <url>", "Add a YouTube video to your library for transcription")
	.action((url: string) => {
		console.log(`Adding video: ${url}`);
		console.log("(Not yet implemented)");
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
