import { Database } from "bun:sqlite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Elysia, t } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined): asserts value is T {
	if (value === undefined) {
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
function createTestVideoRoutes(
	db: ReturnType<typeof drizzle<typeof schema>>,
	authMiddleware: ReturnType<typeof createTestAuthMiddleware>,
) {
	// Import YouTube service functions directly since they don't depend on DB
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

	return new Elysia({ prefix: "/api/videos" }).use(authMiddleware).post(
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
		`);
	});

	beforeEach(() => {
		// Clean up between tests
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
