import { Database } from "bun:sqlite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Elysia, t } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined | null): asserts value is T {
	if (value === undefined || value === null) {
		throw new Error("Expected value to be defined");
	}
}

interface MessagesResponse {
	sessionId: number;
	videoId: number;
	title: string | null;
	messages: Array<{
		id: number;
		role: string;
		content: string;
		createdAt: string;
	}>;
}

interface ErrorResponse {
	error: string;
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
 * Creates test session routes that use the provided test database
 */
function createTestSessionRoutes(
	db: ReturnType<typeof drizzle<typeof schema>>,
	authMiddleware: ReturnType<typeof createTestAuthMiddleware>,
) {
	return new Elysia({ prefix: "/api/sessions" }).use(authMiddleware).get(
		"/:id/messages",
		({ params, user, set }) => {
			const sessionId = params.id;

			const session = db
				.select()
				.from(schema.chatSessions)
				.where(eq(schema.chatSessions.id, sessionId))
				.get();

			if (!session) {
				set.status = 404;
				return { error: "Chat session not found" };
			}

			if (session.userId !== user.id) {
				set.status = 403;
				return { error: "Access denied" };
			}

			const sessionMessages = db
				.select({
					id: schema.messages.id,
					role: schema.messages.role,
					content: schema.messages.content,
					createdAt: schema.messages.createdAt,
				})
				.from(schema.messages)
				.where(eq(schema.messages.sessionId, sessionId))
				.orderBy(asc(schema.messages.createdAt))
				.all();

			return {
				sessionId: session.id,
				videoId: session.videoId,
				title: session.title,
				messages: sessionMessages.map((m) => ({
					id: m.id,
					role: m.role,
					content: m.content,
					createdAt: m.createdAt.toISOString(),
				})),
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

describe("GET /api/sessions/:id/messages", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;
	let completedVideoId: number;
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
				created_at INTEGER NOT NULL,
				deleted_at INTEGER
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

			CREATE TABLE chat_sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				video_id INTEGER NOT NULL REFERENCES videos(id),
				user_id INTEGER NOT NULL REFERENCES users(id),
				title TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
		`);
	});

	beforeEach(() => {
		// Clean up between tests
		sqlite.exec("DELETE FROM messages");
		sqlite.exec("DELETE FROM chat_sessions");
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

		// Create completed video with transcript
		const video = db
			.insert(schema.videos)
			.values({
				userId: testUserId,
				youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				youtubeId: "dQw4w9WgXcQ",
				status: "completed",
				title: "Test Video",
			})
			.returning()
			.get();
		assertDefined(video);
		completedVideoId = video.id;

		// Create app instance with test database
		const authMiddleware = createTestAuthMiddleware(db);
		const sessionRoutes = createTestSessionRoutes(db, authMiddleware);
		app = new Elysia().use(sessionRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			// Create a chat session first
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
				})
				.returning()
				.get();
			assertDefined(chatSession);

			const response = await app.handle(
				new Request(
					`http://localhost/api/sessions/${chatSession.id}/messages`,
					{
						method: "GET",
					},
				),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("session validation", () => {
		it("should return 404 for non-existent session", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/sessions/99999/messages", {
					method: "GET",
					headers: {
						Cookie: `session=${validToken}`,
					},
				}),
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Chat session not found");
		});

		it("should return 403 if session belongs to different user", async () => {
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

			// Create chat session for second user
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: user2.id,
				})
				.returning()
				.get();
			assertDefined(chatSession);

			const response = await app.handle(
				new Request(
					`http://localhost/api/sessions/${chatSession.id}/messages`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Access denied");
		});
	});

	describe("successful retrieval", () => {
		it("should return empty messages for new session", async () => {
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
				})
				.returning()
				.get();
			assertDefined(chatSession);

			const response = await app.handle(
				new Request(
					`http://localhost/api/sessions/${chatSession.id}/messages`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as MessagesResponse;
			expect(body.sessionId).toBe(chatSession.id);
			expect(body.videoId).toBe(completedVideoId);
			expect(body.messages).toEqual([]);
		});

		it("should return all messages in order", async () => {
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "Test Conversation",
				})
				.returning()
				.get();
			assertDefined(chatSession);

			// Add messages with increasing timestamps
			const baseTime = Date.now();
			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "user",
					content: "First question",
					createdAt: new Date(baseTime),
				})
				.run();
			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "assistant",
					content: "First answer",
					createdAt: new Date(baseTime + 1000),
				})
				.run();
			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "user",
					content: "Second question",
					createdAt: new Date(baseTime + 2000),
				})
				.run();
			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "assistant",
					content: "Second answer",
					createdAt: new Date(baseTime + 3000),
				})
				.run();

			const response = await app.handle(
				new Request(
					`http://localhost/api/sessions/${chatSession.id}/messages`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as MessagesResponse;
			expect(body.sessionId).toBe(chatSession.id);
			expect(body.videoId).toBe(completedVideoId);
			expect(body.title).toBe("Test Conversation");
			expect(body.messages.length).toBe(4);

			expect(body.messages[0]?.role).toBe("user");
			expect(body.messages[0]?.content).toBe("First question");
			expect(body.messages[1]?.role).toBe("assistant");
			expect(body.messages[1]?.content).toBe("First answer");
			expect(body.messages[2]?.role).toBe("user");
			expect(body.messages[2]?.content).toBe("Second question");
			expect(body.messages[3]?.role).toBe("assistant");
			expect(body.messages[3]?.content).toBe("Second answer");
		});

		it("should include all message fields", async () => {
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
				})
				.returning()
				.get();
			assertDefined(chatSession);

			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "user",
					content: "Test message",
				})
				.run();

			const response = await app.handle(
				new Request(
					`http://localhost/api/sessions/${chatSession.id}/messages`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as MessagesResponse;
			const message = body.messages[0];
			assertDefined(message);

			expect(message.id).toBeDefined();
			expect(message.role).toBe("user");
			expect(message.content).toBe("Test message");
			expect(message.createdAt).toBeDefined();
			// Verify ISO timestamp format
			expect(new Date(message.createdAt).toISOString()).toBe(message.createdAt);
		});

		it("should return session with null title when not set", async () => {
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
				})
				.returning()
				.get();
			assertDefined(chatSession);

			const response = await app.handle(
				new Request(
					`http://localhost/api/sessions/${chatSession.id}/messages`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as MessagesResponse;
			expect(body.title).toBeNull();
		});
	});
});
