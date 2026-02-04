#!/usr/bin/env bun
/**
 * Creates a test video with transcript in the database for E2E testing.
 * Run with: bun e2e/helpers/create-test-video.ts
 * Outputs JSON with the video details.
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, and } from "drizzle-orm";
import * as schema from "../../src/db/schema";

// Test video data - using a stable public video
const TEST_VIDEO = {
	youtubeId: "e2e-test-video-001",
	youtubeUrl: "https://www.youtube.com/watch?v=e2e-test-001",
	title: "E2E Test Video - Chat Flow",
	duration: 300, // 5 minutes
	thumbnailUrl: null,
};

// Sample transcript content for testing
const TEST_TRANSCRIPT = {
	content: `Welcome to this tutorial about building web applications.
At the beginning, we'll cover the basics of HTML and CSS.
Then at around two minutes in, we discuss JavaScript fundamentals.
The section on React starts at around three minutes.
We'll wrap up with some best practices for modern web development.
Thanks for watching this video on web development basics.`,
	segments: [
		{ start: 0, end: 30, text: "Welcome to this tutorial about building web applications." },
		{ start: 30, end: 60, text: "At the beginning, we'll cover the basics of HTML and CSS." },
		{ start: 60, end: 120, text: "Then at around two minutes in, we discuss JavaScript fundamentals." },
		{ start: 120, end: 180, text: "The section on React starts at around three minutes." },
		{ start: 180, end: 240, text: "We'll wrap up with some best practices for modern web development." },
		{ start: 240, end: 300, text: "Thanks for watching this video on web development basics." },
	],
	language: "en",
};

async function main() {
	const dbPath = process.env.DATABASE_URL ?? "data/ytscribe.db";
	const sqlite = new Database(dbPath);
	sqlite.exec("PRAGMA journal_mode = WAL;");
	const db = drizzle(sqlite, { schema });

	try {
		// Find the E2E test user (created by create-test-session.ts)
		const user = db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, "e2e-test@example.com"))
			.get();

		if (!user) {
			console.error(JSON.stringify({ error: "E2E test user not found. Run create-test-session.ts first." }));
			process.exit(1);
		}

		// Check if the test video already exists for this user
		let video = db
			.select()
			.from(schema.videos)
			.where(
				and(
					eq(schema.videos.userId, user.id),
					eq(schema.videos.youtubeId, TEST_VIDEO.youtubeId)
				)
			)
			.get();

		if (video) {
			// Video exists, ensure it's completed and has transcript
			if (video.status !== "completed") {
				db.update(schema.videos)
					.set({ status: "completed" })
					.where(eq(schema.videos.id, video.id))
					.run();
			}

			// Check if transcript exists
			const existingTranscript = db
				.select()
				.from(schema.transcripts)
				.where(eq(schema.transcripts.videoId, video.id))
				.get();

			if (!existingTranscript) {
				// Create transcript for existing video
				db.insert(schema.transcripts)
					.values({
						videoId: video.id,
						...TEST_TRANSCRIPT,
					})
					.run();
			}
		} else {
			// Create the test video
			video = db
				.insert(schema.videos)
				.values({
					userId: user.id,
					youtubeId: TEST_VIDEO.youtubeId,
					youtubeUrl: TEST_VIDEO.youtubeUrl,
					title: TEST_VIDEO.title,
					duration: TEST_VIDEO.duration,
					thumbnailUrl: TEST_VIDEO.thumbnailUrl,
					status: "completed",
				})
				.returning()
				.get();

			if (!video) {
				console.error(JSON.stringify({ error: "Failed to create test video" }));
				process.exit(1);
			}

			// Create the transcript
			db.insert(schema.transcripts)
				.values({
					videoId: video.id,
					...TEST_TRANSCRIPT,
				})
				.run();
		}

		// Fetch the final video state
		const finalVideo = db
			.select()
			.from(schema.videos)
			.where(eq(schema.videos.id, video.id))
			.get();

		// Output the result as JSON
		console.log(
			JSON.stringify({
				video: {
					id: finalVideo!.id,
					youtubeId: finalVideo!.youtubeId,
					youtubeUrl: finalVideo!.youtubeUrl,
					title: finalVideo!.title,
					duration: finalVideo!.duration,
					status: finalVideo!.status,
				},
				user: {
					id: user.id,
					email: user.email,
				},
			})
		);
	} finally {
		sqlite.close();
	}
}

main();
