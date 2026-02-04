/**
 * Tests for the Effect-TS Database service.
 */

import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Database, makeDatabaseTestLayer } from "../../../src/effect/services/Database";
import * as schema from "../../../src/db/schema";
import { eq } from "drizzle-orm";

describe("Database Effect Service", () => {
	describe("Database.Test layer", () => {
		test("provides access to in-memory database", async () => {
			const program = Effect.gen(function* () {
				const { db } = yield* Database;
				// Should be able to query (even if empty)
				const users = db.select().from(schema.users).all();
				return users;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(Database.Test)),
			);

			expect(result).toEqual([]);
		});

		test("allows inserting and retrieving users", async () => {
			const program = Effect.gen(function* () {
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
				return users;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(Database.Test)),
			);

			expect(result).toHaveLength(1);
			expect(result[0]?.email).toBe("test@example.com");
			expect(result[0]?.name).toBe("Test User");
		});

		test("enforces foreign key constraints", async () => {
			const program = Effect.gen(function* () {
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
					return { success: true };
				} catch {
					return { success: false };
				}
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(Database.Test)),
			);

			expect(result.success).toBe(false);
		});

		test("each test layer creates fresh database", async () => {
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
			const result1 = await Effect.runPromise(
				program1.pipe(Effect.provide(Database.Test)),
			);
			const result2 = await Effect.runPromise(
				program2.pipe(Effect.provide(Database.Test)),
			);

			expect(result1).toHaveLength(1);
			expect(result2).toHaveLength(0); // Fresh database, no users
		});
	});

	describe("makeDatabaseTestLayer factory", () => {
		test("allows custom setup function", async () => {
			const testLayer = makeDatabaseTestLayer((db) => {
				// Seed test data
				db.insert(schema.users)
					.values([
						{ email: "alice@example.com", name: "Alice" },
						{ email: "bob@example.com", name: "Bob" },
					])
					.run();
			});

			const program = Effect.gen(function* () {
				const { db } = yield* Database;
				return db.select().from(schema.users).all();
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toHaveLength(2);
			expect(result.map((u) => u.name)).toContain("Alice");
			expect(result.map((u) => u.name)).toContain("Bob");
		});

		test("supports complex setup with videos and transcripts", async () => {
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

			const program = Effect.gen(function* () {
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

				return { video, transcript };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.video?.title).toBe("Test Video");
			expect(result.transcript?.content).toBe("This is the transcript content.");
		});
	});

	describe("scoped lifecycle", () => {
		test("closes database when scope exits", async () => {
			// We can't easily test the real close() behavior without patching,
			// but we can verify the scoped effect completes properly
			const program = Effect.scoped(
				Effect.gen(function* () {
					const { db } = yield* Database;
					// Database should be usable here
					const users = db.select().from(schema.users).all();
					return users.length;
				}),
			);

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(Database.Test)),
			);

			expect(result).toBe(0);
		});

		test("handles errors during database operations", async () => {
			const program = Effect.gen(function* () {
				const { db } = yield* Database;

				// Execute invalid SQL
				try {
					db.run("SELECT * FROM nonexistent_table");
					return { success: true };
				} catch (error) {
					return { success: false, error: String(error) };
				}
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(Database.Test)),
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("nonexistent_table");
		});
	});

	describe("schema integration", () => {
		test("supports all video status values", async () => {
			const testLayer = makeDatabaseTestLayer((db) => {
				db.insert(schema.users)
					.values({ id: 1, email: "test@example.com" })
					.run();
			});

			const program = Effect.gen(function* () {
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

				return db.select().from(schema.videos).all();
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toHaveLength(4);
			expect(result.map((v) => v.status).sort()).toEqual([
				"completed",
				"failed",
				"pending",
				"processing",
			]);
		});

		test("supports chat sessions and messages", async () => {
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

			const program = Effect.gen(function* () {
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
				return messages;
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toHaveLength(2);
			expect(result[0]?.role).toBe("user");
			expect(result[1]?.role).toBe("assistant");
		});
	});
});
