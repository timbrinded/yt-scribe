#!/usr/bin/env bun
import cac from "cac";
import { ApiClient, ApiRequestError } from "./api";
import { getConfig } from "./config";
import {
	clearCredentials,
	getSessionToken,
	saveCredentials,
} from "./credentials";

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
			console.error(
				"Error: Not authenticated. Please run 'ytscribe login' first.",
			);
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
					console.error(
						"Error: Session expired. Please run 'ytscribe login' again.",
					);
				} else if (error.statusCode === 409) {
					console.error(
						`Error: This video is already in your library (ID: ${error.response.existingVideoId})`,
					);
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
	.option(
		"--status <status>",
		"Filter by status (pending, processing, completed, failed)",
	)
	.action(async (options: { status?: string }) => {
		const sessionToken = getSessionToken();

		if (!sessionToken) {
			console.error(
				"Error: Not authenticated. Please run 'ytscribe login' first.",
			);
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
					console.error(
						`Error: Invalid status. Must be one of: ${validStatuses.join(", ")}`,
					);
					process.exit(1);
				}
				filteredVideos = filteredVideos.filter(
					(v) => v.status === options.status,
				);
			}

			if (filteredVideos.length === 0) {
				if (options.status) {
					console.log(`No videos with status '${options.status}' found.`);
				} else {
					console.log(
						"No videos in your library. Use 'ytscribe add <url>' to add one.",
					);
				}
				return;
			}

			// Calculate column widths
			const idWidth = Math.max(
				2,
				...filteredVideos.map((v) => String(v.id).length),
			);
			const titleWidth = Math.min(
				40,
				Math.max(
					5,
					...filteredVideos.map((v) => (v.title || v.youtubeId).length),
				),
			);
			const statusWidth = Math.max(
				6,
				...filteredVideos.map((v) => v.status.length),
			);
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
				const truncatedTitle =
					title.length > titleWidth
						? title.slice(0, titleWidth - 3) + "..."
						: title;
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
			console.log(
				`Total: ${filteredVideos.length} video${filteredVideos.length !== 1 ? "s" : ""}`,
			);
		} catch (error) {
			if (error instanceof ApiRequestError) {
				if (error.statusCode === 401) {
					console.error(
						"Error: Session expired. Please run 'ytscribe login' again.",
					);
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
	.action(async (videoId: string) => {
		const sessionToken = getSessionToken();

		if (!sessionToken) {
			console.error(
				"Error: Not authenticated. Please run 'ytscribe login' first.",
			);
			process.exit(1);
		}

		// Validate video ID is a number
		const parsedVideoId = Number.parseInt(videoId, 10);
		if (Number.isNaN(parsedVideoId)) {
			console.error("Error: Invalid video ID. Must be a number.");
			process.exit(1);
		}

		const client = new ApiClient();
		client.setSessionToken(sessionToken);

		console.log(`Starting chat for video ${parsedVideoId}...`);
		console.log(
			'Type your message and press Enter. Type "exit" or "quit" to end the session.\n',
		);

		let currentSessionId: number | undefined;

		// Create readline interface for interactive input
		const rl = await import("node:readline");
		const readline = rl.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const prompt = () => {
			readline.question("You: ", async (input) => {
				const trimmedInput = input.trim();

				// Check for exit commands
				if (
					trimmedInput.toLowerCase() === "exit" ||
					trimmedInput.toLowerCase() === "quit"
				) {
					console.log("\nGoodbye!");
					readline.close();
					process.exit(0);
				}

				// Skip empty input
				if (!trimmedInput) {
					prompt();
					return;
				}

				try {
					const result = await client.sendChatMessage(
						parsedVideoId,
						trimmedInput,
						{
							sessionId: currentSessionId,
						},
					);

					// Store session ID for subsequent messages
					currentSessionId = result.sessionId;

					// Display assistant response
					console.log(`\nAssistant: ${result.response}\n`);
				} catch (error) {
					if (error instanceof ApiRequestError) {
						if (error.statusCode === 401) {
							console.error(
								"\nError: Session expired. Please run 'ytscribe login' again.",
							);
							readline.close();
							process.exit(1);
						} else if (error.statusCode === 404) {
							console.error(`\nError: Video not found (ID: ${parsedVideoId})`);
							readline.close();
							process.exit(1);
						} else if (error.statusCode === 403) {
							console.error("\nError: You don't have access to this video.");
							readline.close();
							process.exit(1);
						} else if (error.statusCode === 400) {
							console.error(`\nError: ${error.message}`);
							readline.close();
							process.exit(1);
						} else {
							console.error(`\nError: ${error.message}\n`);
						}
					} else {
						console.error(`\nError: An unexpected error occurred.\n`);
					}
				}

				prompt();
			});
		};

		// Handle Ctrl+C gracefully
		readline.on("close", () => {
			console.log("\nGoodbye!");
			process.exit(0);
		});

		prompt();
	});

// Login command - OAuth authentication
cli
	.command("login", "Authenticate with your account via Google OAuth")
	.action(async () => {
		const config = getConfig();

		// Check if already authenticated
		const existingToken = getSessionToken();
		if (existingToken) {
			// Verify the token is still valid
			const client = new ApiClient();
			client.setSessionToken(existingToken);
			try {
				const response = await fetch(`${config.apiBaseUrl}/auth/me`, {
					headers: { Cookie: `session=${existingToken}` },
				});
				if (response.ok) {
					const user = (await response.json()) as {
						name?: string;
						email: string;
					};
					console.log(`Already logged in as ${user.name || user.email}`);
					console.log(
						"Use 'ytscribe logout' first if you want to switch accounts.",
					);
					return;
				}
			} catch {
				// Token is invalid, proceed with login
			}
		}

		console.log("Starting login flow...");
		console.log("Opening browser for authentication...\n");

		// Find an available port for the callback server
		const callbackPort = 9876 + Math.floor(Math.random() * 100);
		const callbackUrl = `http://localhost:${callbackPort}/callback`;

		// Create a promise that resolves when we receive the token
		let resolveToken: (token: string) => void;
		let rejectToken: (error: Error) => void;
		const tokenPromise = new Promise<string>((resolve, reject) => {
			resolveToken = resolve;
			rejectToken = reject;
		});

		// Start local callback server
		const server = Bun.serve({
			port: callbackPort,
			fetch(req) {
				const url = new URL(req.url);

				if (url.pathname === "/callback") {
					const token = url.searchParams.get("token");
					const error = url.searchParams.get("error");

					if (error) {
						rejectToken(new Error(error));
						return new Response(
							`<html>
								<body style="font-family: system-ui; text-align: center; padding: 50px;">
									<h1>❌ Authentication Failed</h1>
									<p>${error}</p>
									<p>You can close this window.</p>
								</body>
							</html>`,
							{ headers: { "Content-Type": "text/html" } },
						);
					}

					if (token) {
						resolveToken(token);
						return new Response(
							`<html>
								<body style="font-family: system-ui; text-align: center; padding: 50px;">
									<h1>✓ Authentication Successful</h1>
									<p>You can close this window and return to the terminal.</p>
								</body>
							</html>`,
							{ headers: { "Content-Type": "text/html" } },
						);
					}

					return new Response(
						`<html>
							<body style="font-family: system-ui; text-align: center; padding: 50px;">
								<h1>❌ Authentication Failed</h1>
								<p>No token received.</p>
								<p>You can close this window.</p>
							</body>
						</html>`,
						{ headers: { "Content-Type": "text/html" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		// Build OAuth URL with CLI callback
		const authUrl = `${config.apiBaseUrl}/auth/google?cli_callback=${encodeURIComponent(callbackUrl)}`;

		// Open browser
		const openCommand =
			process.platform === "darwin"
				? "open"
				: process.platform === "win32"
					? "start"
					: "xdg-open";

		try {
			const proc = Bun.spawn([openCommand, authUrl], {
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
		} catch {
			console.log(`Please open this URL in your browser:\n${authUrl}\n`);
		}

		console.log("Waiting for authentication...");
		console.log("(Press Ctrl+C to cancel)\n");

		// Set a timeout for the authentication
		const timeoutMs = 5 * 60 * 1000; // 5 minutes
		const timeout = setTimeout(() => {
			rejectToken(new Error("Authentication timed out"));
		}, timeoutMs);

		try {
			const token = await tokenPromise;
			clearTimeout(timeout);
			server.stop();

			// Save the token
			saveCredentials({ sessionToken: token });
			console.log("Login successful!");

			// Fetch and display user info
			try {
				const response = await fetch(`${config.apiBaseUrl}/auth/me`, {
					headers: { Cookie: `session=${token}` },
				});
				if (response.ok) {
					const user = (await response.json()) as {
						name?: string;
						email: string;
					};
					console.log(`Welcome, ${user.name || user.email}!`);
				}
			} catch {
				// Ignore errors fetching user info
			}
		} catch (error) {
			clearTimeout(timeout);
			server.stop();
			console.error(
				`Error: ${error instanceof Error ? error.message : "Authentication failed"}`,
			);
			process.exit(1);
		}
	});

// Logout command - clear credentials
cli.command("logout", "Clear stored credentials").action(async () => {
	const sessionToken = getSessionToken();

	if (!sessionToken) {
		console.log("Not currently logged in.");
		return;
	}

	const config = getConfig();

	// Call the logout endpoint to invalidate the session on the server
	try {
		await fetch(`${config.apiBaseUrl}/auth/logout`, {
			method: "POST",
			headers: { Cookie: `session=${sessionToken}` },
		});
	} catch {
		// Ignore network errors - we'll clear local credentials anyway
	}

	// Clear local credentials
	clearCredentials();
	console.log("Logged out successfully.");
});

// Help is automatically included by CAC
cli.help();

// Parse command line arguments
cli.parse();
