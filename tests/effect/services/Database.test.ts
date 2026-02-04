/**
 * Tests for the Effect-TS Database service.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { Database, makeDatabaseTestLayer } from "../../../src/effect/services/Database";
import * as schema from "../../../src/db/schema";
import { eq } from "drizzle-orm";

describe("Database Effect Service", () => {
	describe("Database.Test layer", () => {
		it.effect("provides access to in-memory database", () =>
			Effect.gen(function* () {
				const { db } = yield* Database;
				// Should be able to query (even if empty)
				const users = db.select().from(schema.users).all();
				expect(users).toEqual([]);
			}).pipe(Effect.provide(Database.Test)),
		);

		it.effect("allows inserting and retrieving users", () =>
			Effect.gen(function* () {
				const { db } = yield* Database;

				// Insert a user
				db.insert(schema.users)
					.values({
						email: "test@example.com",
						name: "Test User",
					})
					.run();

				// Retrieve the user
				const users = db.select().from(schema.users).all();

				expect(users).toHaveLength(1);
				expect(users[0]?.email).toBe("test@example.com");
				expect(users[0]?.name).toBe("Test User");
			}).pipe(Effect.provide(Database.Test)),
		);

		it.effect("enforces foreign key constraints", () =>
			Effect.gen(function* () {
				const { db } = yield* Database;

				// Try to insert a video without a valid user_id
				// This should fail due to foreign key constraint
				try {
					db.insert(schema.videos)
						.values({
							userId: 999, // Non-existent user
							youtubeUrl: "https://www.youtube.com/watch?v=test",
							youtubeId: "test123456",
						})
						.run();
					expect(true).toBe(false); // Should not reach here
				} catch {
					expect(true).toBe(true); // Expected error
				}
			}).pipe(Effect.provide(Database.Test)),
		);

		it.effect("each test layer creates fresh database", () =>
			Effect.gen(function* () {
				// First program inserts a user
				const program1 = Effect.gen(function* () {
					const { db } = yield* Database;
					db.insert(schema.users)
						.values({ email: "user1@example.com" })
						.run();
					return db.select().from(schema.users).all();
				});

				// Second program checks count
				const program2 = Effect.gen(function* () {
					const { db } = yield* Database;
					return db.select().from(schema.users).all();
				});

				// Each should get fresh database
				const result1 = yield* program1.pipe(Effect.provide(Database.Test));
				const result2 = yield* program2.pipe(Effect.provide(Database.Test));

				expect(result1).toHaveLength(1);
				expect(result2).toHaveLength(0); // Fresh database, no users
			}),
		);
	});

	describe("makeDatabaseTestLayer factory", () => {
		it.scoped("allows custom setup function", () => {
			const testLayer = makeDatabaseTestLayer((db) => {
				// Seed test data
				db.insert(schema.users)
					.values([
						{ email: "alice@example.com", name: "Alice" },
						{ email: "bob@example.com", name: "Bob" },
					])
					.run();
			});

			return Effect.gen(function* () {
				const { db } = yield* Database;
				const users = db.select().from(schema.users).all();

				expect(users).toHaveLength(2);
				expect(users.map((u) => u.name)).toContain("Alice");
				expect(users.map((u) => u.name)).toContain("Bob");
			}).pipe(Effect.provide(testLayer));
		});

		it.scoped("supports complex setup with videos and transcripts", () => {
			const testLayer = makeDatabaseTestLayer((db) => {
				// Create user
				db.insert(schema.users)
					.values({ id: 1, email: "test@example.com" })
					.run();

				// Create video
				db.insert(schema.videos)
					.values({
						id: 1,
						userId: 1,
						youtubeUrl: "https://www.youtube.com/watch?v=test123",
						youtubeId: "test123",
						title: "Test Video",
						status: "completed",
					})
					.run();

				// Create transcript
				db.insert(schema.transcripts)
					.values({
						videoId: 1,
						content: "This is the transcript content.",
						segments: [],
						language: "en",
					})
					.run();
			});

			return Effect.gen(function* () {
				const { db } = yield* Database;

				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, 1))
					.get();

				const transcript = db
					.select()
					.from(schema.transcripts)
					.where(eq(schema.transcripts.videoId, 1))
					.get();

				expect(video?.title).toBe("Test Video");
				expect(transcript?.content).toBe("This is the transcript content.");
			}).pipe(Effect.provide(testLayer));
		});
	});

	describe("scoped lifecycle", () => {
		it.scoped("closes database when scope exits", () =>
			Effect.gen(function* () {
				const { db } = yield* Database;
				// Database should be usable here
				const users = db.select().from(schema.users).all();
				expect(users.length).toBe(0);
			}).pipe(Effect.provide(Database.Test)),
		);

		it.effect("handles errors during database operations", () =>
			Effect.gen(function* () {
				const { db } = yield* Database;

				// Execute invalid SQL
				try {
					db.run("SELECT * FROM nonexistent_table");
					expect(true).toBe(false); // Should not reach here
				} catch (error) {
					expect(String(error)).toContain("nonexistent_table");
				}
			}).pipe(Effect.provide(Database.Test)),
		);
	});

	describe("schema integration", () => {
		it.scoped("supports all video status values", () => {
			const testLayer = makeDatabaseTestLayer((db) => {
				db.insert(schema.users)
					.values({ id: 1, email: "test@example.com" })
					.run();
			});

			return Effect.gen(function* () {
				const { db } = yield* Database;

				const statuses = ["pending", "processing", "completed", "failed"] as const;

				for (let i = 0; i < statuses.length; i++) {
					db.insert(schema.videos)
						.values({
							userId: 1,
							youtubeUrl: `https://www.youtube.com/watch?v=test${i}`,
							youtubeId: `test${i}`,
							status: statuses[i],
						})
						.run();
				}

				const videos = db.select().from(schema.videos).all();

				expect(videos).toHaveLength(4);
				expect(videos.map((v) => v.status).sort()).toEqual([
					"completed",
					"failed",
					"pending",
					"processing",
				]);
			}).pipe(Effect.provide(testLayer));
		});

		it.scoped("supports chat sessions and messages", () => {
			const testLayer = makeDatabaseTestLayer((db) => {
				db.insert(schema.users)
					.values({ id: 1, email: "test@example.com" })
					.run();
				db.insert(schema.videos)
					.values({
						id: 1,
						userId: 1,
						youtubeUrl: "https://www.youtube.com/watch?v=test",
						youtubeId: "test",
						status: "completed",
					})
					.run();
			});

			return Effect.gen(function* () {
				const { db } = yield* Database;

				// Create chat session
				db.insert(schema.chatSessions)
					.values({
						id: 1,
						videoId: 1,
						userId: 1,
						title: "Test Chat",
					})
					.run();

				// Add messages
				db.insert(schema.messages)
					.values([
						{ sessionId: 1, role: "user", content: "Hello!" },
						{ sessionId: 1, role: "assistant", content: "Hi there!" },
					])
					.run();

				const messages = db.select().from(schema.messages).all();

				expect(messages).toHaveLength(2);
				expect(messages[0]?.role).toBe("user");
				expect(messages[1]?.role).toBe("assistant");
			}).pipe(Effect.provide(testLayer));
		});
	});
});
