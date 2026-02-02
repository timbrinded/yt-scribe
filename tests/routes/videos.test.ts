import { Database } from "bun:sqlite";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Elysia, t } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined | null): asserts value is T {
	if (value === undefined || value === null) {
		throw new Error("Expected value to be defined");
	}
}

interface VideoResponse {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	status: string;
	createdAt: string;
}

interface ErrorResponse {
	error: string;
	existingVideoId?: number;
}

interface VideoListResponse {
	videos: Array<{
		id: number;
		youtubeUrl: string;
		youtubeId: string;
		title: string | null;
		duration: number | null;
		thumbnailUrl: string | null;
		status: string;
		createdAt: string;
		updatedAt: string;
	}>;
	pagination: {
		limit: number;
		offset: number;
		count: number;
	};
}

interface VideoDetailResponse {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	title: string | null;
	duration: number | null;
	thumbnailUrl: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	transcript: {
		id: number;
		content: string;
		segments: Array<{ start: number; end: number; text: string }>;
		language: string;
		createdAt: string;
	} | null;
}

interface RetryResponse {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	status: string;
	message: string;
}

interface RetryErrorResponse {
	error: string;
	currentStatus?: string;
}

/**
 * Creates a test auth middleware that uses the provided test database
 */
function createTestAuthMiddleware(
	db: ReturnType<typeof drizzle<typeof schema>>,
) {
	function validateSession(token: string) {
		const now = new Date();

		const result = db
			.select({
				session: schema.sessions,
				user: {
					id: schema.users.id,
					email: schema.users.email,
					name: schema.users.name,
					avatarUrl: schema.users.avatarUrl,
				},
			})
			.from(schema.sessions)
			.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
			.where(eq(schema.sessions.token, token))
			.get();

		if (!result || result.session.expiresAt <= now) {
			return null;
		}

		return result;
	}

	return new Elysia({ name: "test-auth-middleware" })
		.guard({
			cookie: t.Cookie({
				session: t.Optional(t.String()),
			}),
		})
		.macro({
			auth: {
				resolve({ cookie: { session }, status }) {
					const sessionToken = session?.value;

					if (!sessionToken || typeof sessionToken !== "string") {
						return status(401, { error: "Not authenticated" });
					}

					const result = validateSession(sessionToken);

					if (!result) {
						session?.remove();
						return status(401, { error: "Invalid or expired session" });
					}

					return { user: result.user };
				},
			},
		});
}

/**
 * Creates test video routes that use the provided test database
 */
// YouTube URL patterns used in tests
const YOUTUBE_URL_PATTERNS = [
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})(?:&|$)/,
	/^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
	/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
];

function isValidYouTubeUrl(url: string): boolean {
	return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function extractVideoId(url: string): string | null {
	for (const pattern of YOUTUBE_URL_PATTERNS) {
		const match = url.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}
	return null;
}

/**
 * Creates test video routes that use the provided test database
 */
function createTestVideoRoutes(
	db: ReturnType<typeof drizzle<typeof schema>>,
	authMiddleware: ReturnType<typeof createTestAuthMiddleware>,
) {
	return new Elysia({ prefix: "/api/videos" })
		.use(authMiddleware)
		.post(
			"/",
			async ({ body, user, set }) => {
				const { url } = body;

				// Validate YouTube URL format
				if (!isValidYouTubeUrl(url)) {
					set.status = 400;
					return { error: "Invalid YouTube URL" };
				}

				// Extract video ID
				const youtubeId = extractVideoId(url);
				if (!youtubeId) {
					set.status = 400;
					return { error: "Could not extract video ID from URL" };
				}

				// Check for duplicate (same youtubeId + userId)
				const existingVideo = db
					.select()
					.from(schema.videos)
					.where(
						and(
							eq(schema.videos.youtubeId, youtubeId),
							eq(schema.videos.userId, user.id),
						),
					)
					.get();

				if (existingVideo) {
					set.status = 409;
					return {
						error: "Video already exists in your library",
						existingVideoId: existingVideo.id,
					};
				}

				// Create video record with status 'pending'
				const video = db
					.insert(schema.videos)
					.values({
						userId: user.id,
						youtubeUrl: url,
						youtubeId,
						status: "pending",
					})
					.returning()
					.get();

				// Return video record with 201 status (skip pipeline trigger in tests)
				set.status = 201;
				return {
					id: video.id,
					youtubeUrl: video.youtubeUrl,
					youtubeId: video.youtubeId,
					status: video.status,
					createdAt: video.createdAt.toISOString(),
				};
			},
			{
				auth: true,
				body: t.Object({
					url: t.String(),
				}),
			},
		)
		.get(
			"/",
			({ user, query }) => {
				const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
				const offset = Math.max(query.offset ?? 0, 0);

				const userVideos = db
					.select({
						id: schema.videos.id,
						youtubeUrl: schema.videos.youtubeUrl,
						youtubeId: schema.videos.youtubeId,
						title: schema.videos.title,
						duration: schema.videos.duration,
						thumbnailUrl: schema.videos.thumbnailUrl,
						status: schema.videos.status,
						createdAt: schema.videos.createdAt,
						updatedAt: schema.videos.updatedAt,
					})
					.from(schema.videos)
					.where(eq(schema.videos.userId, user.id))
					.orderBy(desc(schema.videos.createdAt))
					.limit(limit)
					.offset(offset)
					.all();

				return {
					videos: userVideos.map((video) => ({
						...video,
						createdAt: video.createdAt.toISOString(),
						updatedAt: video.updatedAt.toISOString(),
					})),
					pagination: {
						limit,
						offset,
						count: userVideos.length,
					},
				};
			},
			{
				auth: true,
				query: t.Object({
					limit: t.Optional(t.Numeric()),
					offset: t.Optional(t.Numeric()),
				}),
			},
		)
		.get(
			"/:id",
			({ params, user, set }) => {
				const videoId = params.id;

				// Fetch the video
				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, videoId))
					.get();

				// Return 404 if video doesn't exist
				if (!video) {
					set.status = 404;
					return { error: "Video not found" };
				}

				// Return 403 if video belongs to a different user
				if (video.userId !== user.id) {
					set.status = 403;
					return { error: "Access denied" };
				}

				// Fetch transcript if video is completed
				let transcript = null;
				if (video.status === "completed") {
					const transcriptRecord = db
						.select()
						.from(schema.transcripts)
						.where(eq(schema.transcripts.videoId, videoId))
						.get();

					if (transcriptRecord) {
						transcript = {
							id: transcriptRecord.id,
							content: transcriptRecord.content,
							segments: transcriptRecord.segments,
							language: transcriptRecord.language,
							createdAt: transcriptRecord.createdAt.toISOString(),
						};
					}
				}

				return {
					id: video.id,
					youtubeUrl: video.youtubeUrl,
					youtubeId: video.youtubeId,
					title: video.title,
					duration: video.duration,
					thumbnailUrl: video.thumbnailUrl,
					status: video.status,
					createdAt: video.createdAt.toISOString(),
					updatedAt: video.updatedAt.toISOString(),
					transcript,
				};
			},
			{
				auth: true,
				params: t.Object({
					id: t.Numeric(),
				}),
			},
		)
		.post(
			"/:id/retry",
			async ({ params, user, set }) => {
				const videoId = params.id;

				// Fetch the video
				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, videoId))
					.get();

				// Return 404 if video doesn't exist
				if (!video) {
					set.status = 404;
					return { error: "Video not found" };
				}

				// Return 403 if video belongs to a different user
				if (video.userId !== user.id) {
					set.status = 403;
					return { error: "Access denied" };
				}

				// Return 400 if video is not in failed state
				if (video.status !== "failed") {
					set.status = 400;
					return {
						error: "Can only retry videos with failed status",
						currentStatus: video.status,
					};
				}

				// Reset status to 'pending'
				db.update(schema.videos)
					.set({ status: "pending", updatedAt: new Date() })
					.where(eq(schema.videos.id, videoId))
					.run();

				// Skip pipeline trigger in tests
				return {
					id: video.id,
					youtubeUrl: video.youtubeUrl,
					youtubeId: video.youtubeId,
					status: "pending",
					message: "Video processing retry initiated",
				};
			},
			{
				auth: true,
				params: t.Object({
					id: t.Numeric(),
				}),
			},
		);
}

describe("POST /api/videos", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;
	// biome-ignore lint/suspicious/noExplicitAny: Elysia has complex type inference
	let app: any;

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

			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				token TEXT NOT NULL UNIQUE,
				expires_at INTEGER NOT NULL,
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

	beforeEach(() => {
		// Clean up between tests
		sqlite.exec("DELETE FROM transcripts");
		sqlite.exec("DELETE FROM videos");
		sqlite.exec("DELETE FROM sessions");
		sqlite.exec("DELETE FROM users");

		// Create test user
		const result = db
			.insert(schema.users)
			.values({
				email: "test@example.com",
				name: "Test User",
			})
			.returning()
			.get();
		assertDefined(result);
		testUserId = result.id;

		// Create valid session
		validToken = `valid-test-token-${Date.now()}`;
		db.insert(schema.sessions)
			.values({
				userId: testUserId,
				token: validToken,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			})
			.run();

		// Create app instance with test database
		const authMiddleware = createTestAuthMiddleware(db);
		const videoRoutes = createTestVideoRoutes(db, authMiddleware);
		app = new Elysia().use(videoRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("URL validation", () => {
		it("should return 400 for invalid YouTube URL", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ url: "https://example.com/not-a-video" }),
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Invalid YouTube URL");
		});

		it("should return 400 for empty URL", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ url: "" }),
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Invalid YouTube URL");
		});

		it("should accept standard YouTube watch URL", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);

			expect(response.status).toBe(201);
			const body = (await response.json()) as VideoResponse;
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
		});

		it("should accept short YouTube URL", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
				}),
			);

			expect(response.status).toBe(201);
			const body = (await response.json()) as VideoResponse;
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
		});

		it("should accept YouTube embed URL", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
					}),
				}),
			);

			expect(response.status).toBe(201);
			const body = (await response.json()) as VideoResponse;
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
		});

		it("should accept YouTube shorts URL", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
					}),
				}),
			);

			expect(response.status).toBe(201);
			const body = (await response.json()) as VideoResponse;
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
		});
	});

	describe("video creation", () => {
		it("should create video with status pending", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);

			expect(response.status).toBe(201);
			const body = (await response.json()) as VideoResponse;
			expect(body.status).toBe("pending");
			expect(body.id).toBeGreaterThan(0);
			expect(body.youtubeUrl).toBe(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			);
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
			expect(body.createdAt).toBeDefined();
		});

		it("should store video in database with correct userId", async () => {
			await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);

			const video = db
				.select()
				.from(schema.videos)
				.where(eq(schema.videos.youtubeId, "dQw4w9WgXcQ"))
				.get();

			assertDefined(video);
			expect(video.userId).toBe(testUserId);
			expect(video.status).toBe("pending");
		});
	});

	describe("duplicate detection", () => {
		it("should return 409 when video already exists for user", async () => {
			// First request - should succeed
			const response1 = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);
			expect(response1.status).toBe(201);
			const video1 = (await response1.json()) as VideoResponse;

			// Second request with same video - should fail
			const response2 = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);

			expect(response2.status).toBe(409);
			const body = (await response2.json()) as ErrorResponse;
			expect(body.error).toBe("Video already exists in your library");
			expect(body.existingVideoId).toBe(video1.id);
		});

		it("should return 409 for same video with different URL format", async () => {
			// Add via standard URL
			const response1 = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);
			expect(response1.status).toBe(201);

			// Try to add via short URL - same video ID
			const response2 = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
				}),
			);

			expect(response2.status).toBe(409);
			const body = (await response2.json()) as ErrorResponse;
			expect(body.error).toBe("Video already exists in your library");
		});

		it("should allow same video for different users", async () => {
			// Create second user and session
			const user2 = db
				.insert(schema.users)
				.values({
					email: "other@example.com",
					name: "Other User",
				})
				.returning()
				.get();
			assertDefined(user2);

			const user2Token = `user2-token-${Date.now()}`;
			db.insert(schema.sessions)
				.values({
					userId: user2.id,
					token: user2Token,
					expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
				})
				.run();

			// First user adds video
			const response1 = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);
			expect(response1.status).toBe(201);

			// Second user adds same video - should succeed
			const response2 = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${user2Token}`,
					},
					body: JSON.stringify({
						url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);
			expect(response2.status).toBe(201);

			const body = (await response2.json()) as VideoResponse;
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");

			// Verify both videos exist in database
			const videos = db.select().from(schema.videos).all();
			expect(videos.length).toBe(2);
		});
	});
});

describe("GET /api/videos", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;
	// biome-ignore lint/suspicious/noExplicitAny: Elysia has complex type inference
	let app: any;

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

			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				token TEXT NOT NULL UNIQUE,
				expires_at INTEGER NOT NULL,
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

	beforeEach(() => {
		// Clean up between tests
		sqlite.exec("DELETE FROM transcripts");
		sqlite.exec("DELETE FROM videos");
		sqlite.exec("DELETE FROM sessions");
		sqlite.exec("DELETE FROM users");

		// Create test user
		const result = db
			.insert(schema.users)
			.values({
				email: "test@example.com",
				name: "Test User",
			})
			.returning()
			.get();
		assertDefined(result);
		testUserId = result.id;

		// Create valid session
		validToken = `valid-test-token-${Date.now()}`;
		db.insert(schema.sessions)
			.values({
				userId: testUserId,
				token: validToken,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			})
			.run();

		// Create app instance with test database
		const authMiddleware = createTestAuthMiddleware(db);
		const videoRoutes = createTestVideoRoutes(db, authMiddleware);
		app = new Elysia().use(videoRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "GET",
				}),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("list videos", () => {
		it("should return empty array when user has no videos", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos).toEqual([]);
			expect(body.pagination.count).toBe(0);
		});

		it("should return only current user's videos", async () => {
			// Create second user with a video
			const user2 = db
				.insert(schema.users)
				.values({
					email: "other@example.com",
					name: "Other User",
				})
				.returning()
				.get();
			assertDefined(user2);

			// Add video for second user
			db.insert(schema.videos)
				.values({
					userId: user2.id,
					youtubeUrl: "https://www.youtube.com/watch?v=other12345",
					youtubeId: "other12345a",
					status: "pending",
				})
				.run();

			// Add video for test user
			db.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Test Video",
				})
				.run();

			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos.length).toBe(1);
			const video = body.videos[0];
			assertDefined(video);
			expect(video.youtubeId).toBe("dQw4w9WgXcQ");
			expect(video.title).toBe("Test Video");
			expect(video.status).toBe("completed");
		});

		it("should return videos ordered by createdAt descending", async () => {
			// Add first video (oldest)
			db.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=first123456",
					youtubeId: "first123456",
					status: "completed",
					title: "First Video",
					createdAt: new Date(Date.now() - 2000),
					updatedAt: new Date(Date.now() - 2000),
				})
				.run();

			// Add second video (newer)
			db.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=second12345",
					youtubeId: "second12345",
					status: "pending",
					title: "Second Video",
					createdAt: new Date(Date.now() - 1000),
					updatedAt: new Date(Date.now() - 1000),
				})
				.run();

			// Add third video (newest)
			db.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=third123456",
					youtubeId: "third123456",
					status: "processing",
					title: "Third Video",
				})
				.run();

			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos.length).toBe(3);
			const [newest, middle, oldest] = body.videos;
			assertDefined(newest);
			assertDefined(middle);
			assertDefined(oldest);
			expect(newest.youtubeId).toBe("third123456");
			expect(middle.youtubeId).toBe("second12345");
			expect(oldest.youtubeId).toBe("first123456");
		});

		it("should include all video fields in response", async () => {
			db.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Test Video",
					duration: 300,
					thumbnailUrl: "https://example.com/thumb.jpg",
				})
				.run();

			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos.length).toBe(1);
			const video = body.videos[0];
			assertDefined(video);
			expect(video.id).toBeDefined();
			expect(video.youtubeUrl).toBe(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			);
			expect(video.youtubeId).toBe("dQw4w9WgXcQ");
			expect(video.title).toBe("Test Video");
			expect(video.duration).toBe(300);
			expect(video.thumbnailUrl).toBe("https://example.com/thumb.jpg");
			expect(video.status).toBe("completed");
			expect(video.createdAt).toBeDefined();
			expect(video.updatedAt).toBeDefined();
		});
	});

	describe("pagination", () => {
		beforeEach(() => {
			// Add 25 videos for pagination testing
			for (let i = 0; i < 25; i++) {
				db.insert(schema.videos)
					.values({
						userId: testUserId,
						youtubeUrl: `https://www.youtube.com/watch?v=video${String(i).padStart(2, "0")}12345`,
						youtubeId: `video${String(i).padStart(2, "0")}12345`,
						status: "completed",
						title: `Video ${i}`,
						createdAt: new Date(Date.now() - (25 - i) * 1000),
						updatedAt: new Date(Date.now() - (25 - i) * 1000),
					})
					.run();
			}
		});

		it("should return default limit of 20", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos.length).toBe(20);
			expect(body.pagination.limit).toBe(20);
			expect(body.pagination.offset).toBe(0);
			expect(body.pagination.count).toBe(20);
		});

		it("should respect custom limit", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos?limit=5", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos.length).toBe(5);
			expect(body.pagination.limit).toBe(5);
		});

		it("should respect offset", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos?limit=5&offset=20", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.videos.length).toBe(5);
			expect(body.pagination.offset).toBe(20);
			expect(body.pagination.count).toBe(5);
		});

		it("should cap limit at 100", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos?limit=500", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.pagination.limit).toBe(100);
		});

		it("should enforce minimum limit of 1", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos?limit=0", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.pagination.limit).toBe(1);
			expect(body.videos.length).toBe(1);
		});

		it("should handle negative offset as 0", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos?offset=-10", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoListResponse;
			expect(body.pagination.offset).toBe(0);
		});
	});
});

describe("GET /api/videos/:id", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;
	// biome-ignore lint/suspicious/noExplicitAny: Elysia has complex type inference
	let app: any;

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

			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				token TEXT NOT NULL UNIQUE,
				expires_at INTEGER NOT NULL,
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

	beforeEach(() => {
		// Clean up between tests
		sqlite.exec("DELETE FROM transcripts");
		sqlite.exec("DELETE FROM videos");
		sqlite.exec("DELETE FROM sessions");
		sqlite.exec("DELETE FROM users");

		// Create test user
		const result = db
			.insert(schema.users)
			.values({
				email: "test@example.com",
				name: "Test User",
			})
			.returning()
			.get();
		assertDefined(result);
		testUserId = result.id;

		// Create valid session
		validToken = `valid-test-token-${Date.now()}`;
		db.insert(schema.sessions)
			.values({
				userId: testUserId,
				token: validToken,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			})
			.run();

		// Create app instance with test database
		const authMiddleware = createTestAuthMiddleware(db);
		const videoRoutes = createTestVideoRoutes(db, authMiddleware);
		app = new Elysia().use(videoRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos/1", {
					method: "GET",
				}),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("video not found", () => {
		it("should return 404 for non-existent video", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos/99999", {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Video not found");
		});
	});

	describe("access control", () => {
		it("should return 403 if video belongs to different user", async () => {
			// Create second user
			const user2 = db
				.insert(schema.users)
				.values({
					email: "other@example.com",
					name: "Other User",
				})
				.returning()
				.get();
			assertDefined(user2);

			// Create video for second user
			const video = db
				.insert(schema.videos)
				.values({
					userId: user2.id,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Other User's Video",
				})
				.returning()
				.get();
			assertDefined(video);

			// Try to access with first user's session
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Access denied");
		});
	});

	describe("success cases", () => {
		it("should return video without transcript when status is pending", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "pending",
					title: "Pending Video",
					duration: 300,
					thumbnailUrl: "https://example.com/thumb.jpg",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoDetailResponse;
			expect(body.id).toBe(video.id);
			expect(body.youtubeUrl).toBe(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			);
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
			expect(body.title).toBe("Pending Video");
			expect(body.duration).toBe(300);
			expect(body.thumbnailUrl).toBe("https://example.com/thumb.jpg");
			expect(body.status).toBe("pending");
			expect(body.transcript).toBeNull();
		});

		it("should return video without transcript when status is processing", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "processing",
					title: "Processing Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoDetailResponse;
			expect(body.status).toBe("processing");
			expect(body.transcript).toBeNull();
		});

		it("should return video without transcript when status is failed", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "failed",
					title: "Failed Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoDetailResponse;
			expect(body.status).toBe("failed");
			expect(body.transcript).toBeNull();
		});

		it("should return video with transcript when status is completed", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Completed Video",
					duration: 300,
				})
				.returning()
				.get();
			assertDefined(video);

			const segments = [
				{ start: 0, end: 5, text: "Hello world" },
				{ start: 5, end: 10, text: "This is a test" },
			];

			db.insert(schema.transcripts)
				.values({
					videoId: video.id,
					content: "Hello world This is a test",
					segments: segments,
					language: "en",
				})
				.run();

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoDetailResponse;
			expect(body.id).toBe(video.id);
			expect(body.status).toBe("completed");
			expect(body.transcript).not.toBeNull();
			const transcript = body.transcript;
			assertDefined(transcript);
			expect(transcript.content).toBe("Hello world This is a test");
			expect(transcript.segments).toEqual(segments);
			expect(transcript.language).toBe("en");
			expect(transcript.createdAt).toBeDefined();
		});

		it("should return completed video with null transcript if transcript not found", async () => {
			// Edge case: video marked as completed but transcript missing
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Completed Without Transcript",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoDetailResponse;
			expect(body.status).toBe("completed");
			expect(body.transcript).toBeNull();
		});

		it("should include all video fields in response", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Full Video",
					duration: 600,
					thumbnailUrl: "https://example.com/full-thumb.jpg",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}`, {
					method: "GET",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as VideoDetailResponse;
			expect(body.id).toBeDefined();
			expect(body.youtubeUrl).toBeDefined();
			expect(body.youtubeId).toBeDefined();
			expect(body.title).toBeDefined();
			expect(body.duration).toBeDefined();
			expect(body.thumbnailUrl).toBeDefined();
			expect(body.status).toBeDefined();
			expect(body.createdAt).toBeDefined();
			expect(body.updatedAt).toBeDefined();
			expect("transcript" in body).toBe(true);
		});
	});
});

describe("POST /api/videos/:id/retry", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;
	// biome-ignore lint/suspicious/noExplicitAny: Elysia has complex type inference
	let app: any;

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

			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				token TEXT NOT NULL UNIQUE,
				expires_at INTEGER NOT NULL,
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

	beforeEach(() => {
		// Clean up between tests
		sqlite.exec("DELETE FROM transcripts");
		sqlite.exec("DELETE FROM videos");
		sqlite.exec("DELETE FROM sessions");
		sqlite.exec("DELETE FROM users");

		// Create test user
		const result = db
			.insert(schema.users)
			.values({
				email: "test@example.com",
				name: "Test User",
			})
			.returning()
			.get();
		assertDefined(result);
		testUserId = result.id;

		// Create valid session
		validToken = `valid-test-token-${Date.now()}`;
		db.insert(schema.sessions)
			.values({
				userId: testUserId,
				token: validToken,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			})
			.run();

		// Create app instance with test database
		const authMiddleware = createTestAuthMiddleware(db);
		const videoRoutes = createTestVideoRoutes(db, authMiddleware);
		app = new Elysia().use(videoRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos/1/retry", {
					method: "POST",
				}),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("video not found", () => {
		it("should return 404 for non-existent video", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos/99999/retry", {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Video not found");
		});
	});

	describe("access control", () => {
		it("should return 403 if video belongs to different user", async () => {
			// Create second user
			const user2 = db
				.insert(schema.users)
				.values({
					email: "other@example.com",
					name: "Other User",
				})
				.returning()
				.get();
			assertDefined(user2);

			// Create failed video for second user
			const video = db
				.insert(schema.videos)
				.values({
					userId: user2.id,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "failed",
					title: "Other User's Video",
				})
				.returning()
				.get();
			assertDefined(video);

			// Try to retry with first user's session
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/retry`, {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Access denied");
		});
	});

	describe("status validation", () => {
		it("should return 400 if video status is pending", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "pending",
					title: "Pending Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/retry`, {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as RetryErrorResponse;
			expect(body.error).toBe("Can only retry videos with failed status");
			expect(body.currentStatus).toBe("pending");
		});

		it("should return 400 if video status is processing", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "processing",
					title: "Processing Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/retry`, {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as RetryErrorResponse;
			expect(body.error).toBe("Can only retry videos with failed status");
			expect(body.currentStatus).toBe("processing");
		});

		it("should return 400 if video status is completed", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "completed",
					title: "Completed Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/retry`, {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as RetryErrorResponse;
			expect(body.error).toBe("Can only retry videos with failed status");
			expect(body.currentStatus).toBe("completed");
		});
	});

	describe("successful retry", () => {
		it("should successfully trigger retry for failed video", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "failed",
					title: "Failed Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/retry`, {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as RetryResponse;
			expect(body.id).toBe(video.id);
			expect(body.youtubeUrl).toBe(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			);
			expect(body.youtubeId).toBe("dQw4w9WgXcQ");
			expect(body.status).toBe("pending");
			expect(body.message).toBe("Video processing retry initiated");
		});

		it("should update video status to pending in database", async () => {
			const video = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
					youtubeId: "dQw4w9WgXcQ",
					status: "failed",
					title: "Failed Video",
				})
				.returning()
				.get();
			assertDefined(video);

			await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/retry`, {
					method: "POST",
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			// Check database was updated
			const updatedVideo = db
				.select()
				.from(schema.videos)
				.where(eq(schema.videos.id, video.id))
				.get();
			assertDefined(updatedVideo);
			expect(updatedVideo.status).toBe("pending");
		});
	});
});
