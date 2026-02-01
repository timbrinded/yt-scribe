import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined): asserts value is T {
	if (value === undefined) {
		throw new Error("Expected value to be defined");
	}
}

describe("database schema", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;

	beforeAll(() => {
		sqlite = new Database(":memory:");
		sqlite.exec("PRAGMA journal_mode = WAL;");
		sqlite.exec("PRAGMA foreign_keys = ON;");
		db = drizzle(sqlite, { schema });

		sqlite.exec(`
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL UNIQUE,
				name TEXT,
				avatar_url TEXT,
				created_at INTEGER NOT NULL
			);

			CREATE TABLE videos (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				youtube_url TEXT NOT NULL,
				youtube_id TEXT NOT NULL,
				title TEXT,
				duration INTEGER,
				thumbnail_url TEXT,
				status TEXT NOT NULL DEFAULT 'pending',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE transcripts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				video_id INTEGER NOT NULL REFERENCES videos(id),
				content TEXT NOT NULL,
				segments TEXT NOT NULL,
				language TEXT NOT NULL DEFAULT 'en',
				created_at INTEGER NOT NULL
			);
		`);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("users table", () => {
		it("should insert and retrieve a user", () => {
			const newUser: schema.NewUser = {
				email: "test@example.com",
				name: "Test User",
			};

			const result = db.insert(schema.users).values(newUser).returning().all();
			expect(result).toHaveLength(1);
			const inserted = result[0];
			assertDefined(inserted);

			expect(inserted.id).toBeDefined();
			expect(inserted.email).toBe("test@example.com");
			expect(inserted.name).toBe("Test User");
			expect(inserted.createdAt).toBeInstanceOf(Date);
		});
	});

	describe("videos table", () => {
		it("should insert and retrieve a video", () => {
			const userResult = db
				.select()
				.from(schema.users)
				.where(eq(schema.users.email, "test@example.com"))
				.all();
			expect(userResult).toHaveLength(1);
			const user = userResult[0];
			assertDefined(user);

			const newVideo: schema.NewVideo = {
				userId: user.id,
				youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				youtubeId: "dQw4w9WgXcQ",
				title: "Test Video",
				duration: 212,
				thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg",
				status: "pending",
			};

			const result = db
				.insert(schema.videos)
				.values(newVideo)
				.returning()
				.all();
			expect(result).toHaveLength(1);
			const inserted = result[0];
			assertDefined(inserted);

			expect(inserted.id).toBeDefined();
			expect(inserted.userId).toBe(user.id);
			expect(inserted.youtubeUrl).toBe(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			);
			expect(inserted.youtubeId).toBe("dQw4w9WgXcQ");
			expect(inserted.title).toBe("Test Video");
			expect(inserted.duration).toBe(212);
			expect(inserted.status).toBe("pending");
			expect(inserted.createdAt).toBeInstanceOf(Date);
			expect(inserted.updatedAt).toBeInstanceOf(Date);
		});

		it("should enforce foreign key to users", () => {
			const invalidVideo: schema.NewVideo = {
				userId: 99999,
				youtubeUrl: "https://www.youtube.com/watch?v=invalid",
				youtubeId: "invalid",
				status: "pending",
			};

			expect(() => {
				db.insert(schema.videos).values(invalidVideo).returning().all();
			}).toThrow();
		});

		it("should support all video status values", () => {
			const userResult = db.select().from(schema.users).limit(1).all();
			expect(userResult).toHaveLength(1);
			const user = userResult[0];
			assertDefined(user);

			for (const status of schema.videoStatusEnum) {
				const video: schema.NewVideo = {
					userId: user.id,
					youtubeUrl: `https://www.youtube.com/watch?v=${status}`,
					youtubeId: status,
					status,
				};

				const result = db.insert(schema.videos).values(video).returning().all();
				expect(result).toHaveLength(1);
				const inserted = result[0];
				assertDefined(inserted);
				expect(inserted.status).toBe(status);
			}
		});
	});

	describe("transcripts table", () => {
		it("should insert and retrieve a transcript linked to video", () => {
			const videoResult = db.select().from(schema.videos).limit(1).all();
			expect(videoResult).toHaveLength(1);
			const video = videoResult[0];
			assertDefined(video);

			const segments: schema.TranscriptSegment[] = [
				{ start: 0, end: 5.2, text: "Hello and welcome" },
				{ start: 5.2, end: 10.5, text: "to this video" },
				{ start: 10.5, end: 15.8, text: "about testing transcripts" },
			];

			const newTranscript: schema.NewTranscript = {
				videoId: video.id,
				content: "Hello and welcome to this video about testing transcripts",
				segments,
				language: "en",
			};

			const result = db
				.insert(schema.transcripts)
				.values(newTranscript)
				.returning()
				.all();
			expect(result).toHaveLength(1);
			const inserted = result[0];
			assertDefined(inserted);

			expect(inserted.id).toBeDefined();
			expect(inserted.videoId).toBe(video.id);
			expect(inserted.content).toBe(
				"Hello and welcome to this video about testing transcripts",
			);
			expect(inserted.segments).toEqual(segments);
			expect(inserted.language).toBe("en");
			expect(inserted.createdAt).toBeInstanceOf(Date);
		});

		it("should enforce foreign key to videos", () => {
			const invalidTranscript: schema.NewTranscript = {
				videoId: 99999,
				content: "Test content",
				segments: [],
				language: "en",
			};

			expect(() => {
				db.insert(schema.transcripts)
					.values(invalidTranscript)
					.returning()
					.all();
			}).toThrow();
		});

		it("should support different languages", () => {
			const videoResult = db.select().from(schema.videos).limit(1).all();
			const video = videoResult[0];
			assertDefined(video);

			const languages = ["en", "es", "fr", "de", "ja"];

			for (const language of languages) {
				const transcript: schema.NewTranscript = {
					videoId: video.id,
					content: `Content in ${language}`,
					segments: [{ start: 0, end: 1, text: `Text in ${language}` }],
					language,
				};

				const result = db
					.insert(schema.transcripts)
					.values(transcript)
					.returning()
					.all();
				expect(result).toHaveLength(1);
				const inserted = result[0];
				assertDefined(inserted);
				expect(inserted.language).toBe(language);
			}
		});
	});
});
