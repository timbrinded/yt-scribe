import { Database } from "bun:sqlite";
import { asc, count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Elysia, t } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined | null): asserts value is T {
	if (value === undefined || value === null) {
		throw new Error("Expected value to be defined");
	}
}

interface ChatResponse {
	sessionId: number;
	response: string;
}

interface SessionsListResponse {
	sessions: Array<{
		id: number;
		title: string | null;
		messageCount: number;
		createdAt: string;
		updatedAt: string;
	}>;
}

interface ErrorResponse {
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
 * Creates test sessions list routes that use the provided test database
 */
function createTestSessionsListRoutes(
	db: ReturnType<typeof drizzle<typeof schema>>,
	authMiddleware: ReturnType<typeof createTestAuthMiddleware>,
) {
	return new Elysia({ prefix: "/api/videos" }).use(authMiddleware).get(
		"/:id/sessions",
		({ params, user, set }) => {
			const videoId = params.id;

			const video = db
				.select()
				.from(schema.videos)
				.where(eq(schema.videos.id, videoId))
				.get();

			if (!video) {
				set.status = 404;
				return { error: "Video not found" };
			}

			if (video.userId !== user.id) {
				set.status = 403;
				return { error: "Access denied" };
			}

			const sessionsWithCounts = db
				.select({
					id: schema.chatSessions.id,
					title: schema.chatSessions.title,
					createdAt: schema.chatSessions.createdAt,
					updatedAt: schema.chatSessions.updatedAt,
					messageCount: count(schema.messages.id),
				})
				.from(schema.chatSessions)
				.leftJoin(
					schema.messages,
					eq(schema.messages.sessionId, schema.chatSessions.id),
				)
				.where(eq(schema.chatSessions.videoId, videoId))
				.groupBy(schema.chatSessions.id)
				.orderBy(desc(schema.chatSessions.updatedAt))
				.all();

			return {
				sessions: sessionsWithCounts.map((s) => ({
					id: s.id,
					title: s.title,
					messageCount: s.messageCount,
					createdAt: s.createdAt.toISOString(),
					updatedAt: s.updatedAt.toISOString(),
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

/**
 * Creates test chat routes that use the provided test database
 * and a mock chat function
 */
function createTestChatRoutes(
	db: ReturnType<typeof drizzle<typeof schema>>,
	authMiddleware: ReturnType<typeof createTestAuthMiddleware>,
	mockChatComplete: (
		transcript: string,
		previousMessages: Array<{ role: string; content: string }>,
		message: string,
		videoTitle?: string,
	) => Promise<string>,
) {
	return new Elysia({ prefix: "/api/videos" }).use(authMiddleware).post(
		"/:id/chat",
		async ({ params, body, user, set }) => {
			const videoId = params.id;
			const { sessionId, message } = body;

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

			// Return 400 if video is not completed (no transcript available)
			if (video.status !== "completed") {
				set.status = 400;
				return {
					error: "Video transcript not available",
					currentStatus: video.status,
				};
			}

			// Load transcript for the video
			const transcript = db
				.select()
				.from(schema.transcripts)
				.where(eq(schema.transcripts.videoId, videoId))
				.get();

			if (!transcript) {
				set.status = 400;
				return { error: "Transcript not found for this video" };
			}

			let chatSession: schema.ChatSession;

			// Handle session - create new or validate existing
			if (sessionId) {
				// Validate existing session
				const existingSession = db
					.select()
					.from(schema.chatSessions)
					.where(eq(schema.chatSessions.id, sessionId))
					.get();

				if (!existingSession) {
					set.status = 404;
					return { error: "Chat session not found" };
				}

				// Verify session belongs to this video and user
				if (existingSession.videoId !== videoId) {
					set.status = 400;
					return { error: "Session does not belong to this video" };
				}

				if (existingSession.userId !== user.id) {
					set.status = 403;
					return { error: "Access denied to this chat session" };
				}

				chatSession = existingSession;
			} else {
				// Create new chat session
				chatSession = db
					.insert(schema.chatSessions)
					.values({
						videoId,
						userId: user.id,
					})
					.returning()
					.get();
			}

			// Load previous messages if existing session
			const previousMessages = db
				.select({
					role: schema.messages.role,
					content: schema.messages.content,
				})
				.from(schema.messages)
				.where(eq(schema.messages.sessionId, chatSession.id))
				.orderBy(asc(schema.messages.createdAt))
				.all();

			// Save user message to database
			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "user",
					content: message,
				})
				.run();

			// Call mock chat service
			const response = await mockChatComplete(
				transcript.content,
				previousMessages,
				message,
				video.title ?? undefined,
			);

			// Save assistant message to database
			db.insert(schema.messages)
				.values({
					sessionId: chatSession.id,
					role: "assistant",
					content: response,
				})
				.run();

			// Update session's updatedAt timestamp
			db.update(schema.chatSessions)
				.set({ updatedAt: new Date() })
				.where(eq(schema.chatSessions.id, chatSession.id))
				.run();

			return {
				sessionId: chatSession.id,
				response,
			};
		},
		{
			auth: true,
			params: t.Object({
				id: t.Numeric(),
			}),
			body: t.Object({
				sessionId: t.Optional(t.Number()),
				message: t.String(),
			}),
		},
	);
}

describe("POST /api/videos/:id/chat", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;
	let completedVideoId: number;
	let app: any;

	// Mock chat function
	const mockChatComplete = async (
		_transcript: string,
		_previousMessages: Array<{ role: string; content: string }>,
		message: string,
		_videoTitle?: string,
	): Promise<string> => {
		return `Mock response to: ${message}`;
	};

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

		// Create transcript for the video
		db.insert(schema.transcripts)
			.values({
				videoId: completedVideoId,
				content: "This is the transcript content",
				segments: [
					{ start: 0, end: 5, text: "This is the transcript content" },
				],
				language: "en",
			})
			.run();

		// Create app instance with test database
		const authMiddleware = createTestAuthMiddleware(db);
		const chatRoutes = createTestChatRoutes(
			db,
			authMiddleware,
			mockChatComplete,
		);
		app = new Elysia().use(chatRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("video validation", () => {
		it("should return 404 for non-existent video", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos/99999/chat", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Video not found");
		});

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
					youtubeUrl: "https://www.youtube.com/watch?v=other123456",
					youtubeId: "other123456",
					status: "completed",
					title: "Other User's Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Access denied");
		});

		it("should return 400 if video is not completed (pending)", async () => {
			const pendingVideo = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=pending1234",
					youtubeId: "pending1234",
					status: "pending",
					title: "Pending Video",
				})
				.returning()
				.get();
			assertDefined(pendingVideo);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${pendingVideo.id}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Video transcript not available");
			expect(body.currentStatus).toBe("pending");
		});

		it("should return 400 if video is not completed (processing)", async () => {
			const processingVideo = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=process1234",
					youtubeId: "process1234",
					status: "processing",
					title: "Processing Video",
				})
				.returning()
				.get();
			assertDefined(processingVideo);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${processingVideo.id}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Video transcript not available");
			expect(body.currentStatus).toBe("processing");
		});

		it("should return 400 if video is completed but transcript is missing", async () => {
			// Create completed video without transcript
			const videoNoTranscript = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=notransc123",
					youtubeId: "notransc123",
					status: "completed",
					title: "No Transcript Video",
				})
				.returning()
				.get();
			assertDefined(videoNoTranscript);

			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${videoNoTranscript.id}/chat`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Cookie: `session=${validToken}`,
						},
						body: JSON.stringify({ message: "Hello" }),
					},
				),
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Transcript not found for this video");
		});
	});

	describe("new session creation", () => {
		it("should create new chat session when no sessionId provided", async () => {
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "What is this video about?" }),
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as ChatResponse;
			expect(body.sessionId).toBeDefined();
			expect(body.sessionId).toBeGreaterThan(0);
			expect(body.response).toBe("Mock response to: What is this video about?");
		});

		it("should store chat session in database", async () => {
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			const body = (await response.json()) as ChatResponse;

			// Verify session in database
			const session = db
				.select()
				.from(schema.chatSessions)
				.where(eq(schema.chatSessions.id, body.sessionId))
				.get();

			assertDefined(session);
			expect(session.videoId).toBe(completedVideoId);
			expect(session.userId).toBe(testUserId);
		});

		it("should save both user and assistant messages to database", async () => {
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Test message" }),
				}),
			);

			const body = (await response.json()) as ChatResponse;

			// Verify messages in database
			const messages = db
				.select()
				.from(schema.messages)
				.where(eq(schema.messages.sessionId, body.sessionId))
				.orderBy(asc(schema.messages.createdAt))
				.all();

			expect(messages.length).toBe(2);

			const userMessage = messages[0];
			assertDefined(userMessage);
			expect(userMessage.role).toBe("user");
			expect(userMessage.content).toBe("Test message");

			const assistantMessage = messages[1];
			assertDefined(assistantMessage);
			expect(assistantMessage.role).toBe("assistant");
			expect(assistantMessage.content).toBe("Mock response to: Test message");
		});
	});

	describe("continuing existing session", () => {
		it("should continue existing session when sessionId provided", async () => {
			// Create first message to establish session
			const response1 = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "First message" }),
				}),
			);

			const body1 = (await response1.json()) as ChatResponse;
			const sessionId = body1.sessionId;

			// Send second message with session ID
			const response2 = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId,
						message: "Second message",
					}),
				}),
			);

			expect(response2.status).toBe(200);
			const body2 = (await response2.json()) as ChatResponse;
			expect(body2.sessionId).toBe(sessionId);
			expect(body2.response).toBe("Mock response to: Second message");
		});

		it("should have access to previous messages in session", async () => {
			// Track previous messages passed to mock
			let capturedPreviousMessages: Array<{ role: string; content: string }> =
				[];
			const trackingMockChatComplete = async (
				_transcript: string,
				previousMessages: Array<{ role: string; content: string }>,
				message: string,
				_videoTitle?: string,
			): Promise<string> => {
				capturedPreviousMessages = previousMessages;
				return `Mock response to: ${message}`;
			};

			// Create app with tracking mock
			const authMiddleware = createTestAuthMiddleware(db);
			const chatRoutes = createTestChatRoutes(
				db,
				authMiddleware,
				trackingMockChatComplete,
			);
			const trackingApp = new Elysia().use(chatRoutes);

			// Create first message
			const response1 = await trackingApp.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "First message" }),
				}),
			);

			const body1 = (await response1.json()) as ChatResponse;
			const sessionId = body1.sessionId;

			// First message should have no previous messages
			expect(capturedPreviousMessages.length).toBe(0);

			// Send second message
			await trackingApp.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId,
						message: "Second message",
					}),
				}),
			);

			// Second message should have previous messages
			expect(capturedPreviousMessages.length).toBe(2);
			expect(capturedPreviousMessages[0]?.role).toBe("user");
			expect(capturedPreviousMessages[0]?.content).toBe("First message");
			expect(capturedPreviousMessages[1]?.role).toBe("assistant");
			expect(capturedPreviousMessages[1]?.content).toBe(
				"Mock response to: First message",
			);
		});

		it("should return 404 for non-existent session", async () => {
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId: 99999,
						message: "Hello",
					}),
				}),
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Chat session not found");
		});

		it("should return 400 if session belongs to different video", async () => {
			// Create another completed video with transcript
			const anotherVideo = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=another1234",
					youtubeId: "another1234",
					status: "completed",
					title: "Another Video",
				})
				.returning()
				.get();
			assertDefined(anotherVideo);

			db.insert(schema.transcripts)
				.values({
					videoId: anotherVideo.id,
					content: "Another transcript",
					segments: [{ start: 0, end: 5, text: "Another transcript" }],
					language: "en",
				})
				.run();

			// Create session for the original video
			const response1 = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Hello" }),
				}),
			);

			const body1 = (await response1.json()) as ChatResponse;

			// Try to use that session with a different video
			const response2 = await app.handle(
				new Request(`http://localhost/api/videos/${anotherVideo.id}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId: body1.sessionId,
						message: "Hello",
					}),
				}),
			);

			expect(response2.status).toBe(400);
			const body2 = (await response2.json()) as ErrorResponse;
			expect(body2.error).toBe("Session does not belong to this video");
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

			// Create session for second user on the same video
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: user2.id,
				})
				.returning()
				.get();
			assertDefined(chatSession);

			// Try to use that session as first user
			const response = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId: chatSession.id,
						message: "Hello",
					}),
				}),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Access denied to this chat session");
		});

		it("should accumulate messages in session over multiple exchanges", async () => {
			// First message
			const response1 = await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({ message: "Message 1" }),
				}),
			);
			const body1 = (await response1.json()) as ChatResponse;
			const sessionId = body1.sessionId;

			// Second message
			await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId,
						message: "Message 2",
					}),
				}),
			);

			// Third message
			await app.handle(
				new Request(`http://localhost/api/videos/${completedVideoId}/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: `session=${validToken}`,
					},
					body: JSON.stringify({
						sessionId,
						message: "Message 3",
					}),
				}),
			);

			// Verify all messages in database
			const messages = db
				.select()
				.from(schema.messages)
				.where(eq(schema.messages.sessionId, sessionId))
				.orderBy(asc(schema.messages.createdAt))
				.all();

			expect(messages.length).toBe(6); // 3 user + 3 assistant messages

			expect(messages[0]?.role).toBe("user");
			expect(messages[0]?.content).toBe("Message 1");
			expect(messages[1]?.role).toBe("assistant");
			expect(messages[1]?.content).toBe("Mock response to: Message 1");
			expect(messages[2]?.role).toBe("user");
			expect(messages[2]?.content).toBe("Message 2");
			expect(messages[3]?.role).toBe("assistant");
			expect(messages[3]?.content).toBe("Mock response to: Message 2");
			expect(messages[4]?.role).toBe("user");
			expect(messages[4]?.content).toBe("Message 3");
			expect(messages[5]?.role).toBe("assistant");
			expect(messages[5]?.content).toBe("Mock response to: Message 3");
		});
	});
});

describe("GET /api/videos/:id/sessions", () => {
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

		// Create completed video
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
		const sessionsListRoutes = createTestSessionsListRoutes(db, authMiddleware);
		app = new Elysia().use(sessionsListRoutes);
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("authentication", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
					},
				),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("video validation", () => {
		it("should return 404 for non-existent video", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/videos/99999/sessions", {
					method: "GET",
					headers: {
						Cookie: `session=${validToken}`,
					},
				}),
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Video not found");
		});

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
					youtubeUrl: "https://www.youtube.com/watch?v=other123456",
					youtubeId: "other123456",
					status: "completed",
					title: "Other User's Video",
				})
				.returning()
				.get();
			assertDefined(video);

			const response = await app.handle(
				new Request(`http://localhost/api/videos/${video.id}/sessions`, {
					method: "GET",
					headers: {
						Cookie: `session=${validToken}`,
					},
				}),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Access denied");
		});
	});

	describe("successful retrieval", () => {
		it("should return empty array when no sessions exist", async () => {
			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as SessionsListResponse;
			expect(body.sessions).toEqual([]);
		});

		it("should return list of sessions with message counts", async () => {
			// Create two chat sessions
			const session1 = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "First Conversation",
				})
				.returning()
				.get();
			assertDefined(session1);

			const session2 = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "Second Conversation",
				})
				.returning()
				.get();
			assertDefined(session2);

			// Add messages to first session
			db.insert(schema.messages)
				.values([
					{ sessionId: session1.id, role: "user", content: "Hello" },
					{ sessionId: session1.id, role: "assistant", content: "Hi" },
				])
				.run();

			// Add messages to second session
			db.insert(schema.messages)
				.values([
					{ sessionId: session2.id, role: "user", content: "Question" },
					{ sessionId: session2.id, role: "assistant", content: "Answer" },
					{ sessionId: session2.id, role: "user", content: "Follow up" },
					{ sessionId: session2.id, role: "assistant", content: "More info" },
				])
				.run();

			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as SessionsListResponse;
			expect(body.sessions.length).toBe(2);

			// Sessions should include message counts
			const s1 = body.sessions.find((s) => s.title === "First Conversation");
			const s2 = body.sessions.find((s) => s.title === "Second Conversation");
			assertDefined(s1);
			assertDefined(s2);

			expect(s1.messageCount).toBe(2);
			expect(s2.messageCount).toBe(4);
		});

		it("should order sessions by updatedAt descending (newest first)", async () => {
			const baseTime = Date.now();

			// Create sessions with different updatedAt times
			db.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "Older Session",
					updatedAt: new Date(baseTime - 10000),
				})
				.run();

			db.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "Newer Session",
					updatedAt: new Date(baseTime),
				})
				.run();

			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as SessionsListResponse;
			expect(body.sessions.length).toBe(2);
			expect(body.sessions[0]?.title).toBe("Newer Session");
			expect(body.sessions[1]?.title).toBe("Older Session");
		});

		it("should include all session fields", async () => {
			const chatSession = db
				.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "Test Session",
				})
				.returning()
				.get();
			assertDefined(chatSession);

			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as SessionsListResponse;
			expect(body.sessions.length).toBe(1);

			const session = body.sessions[0];
			assertDefined(session);

			expect(session.id).toBe(chatSession.id);
			expect(session.title).toBe("Test Session");
			expect(session.messageCount).toBe(0);
			expect(session.createdAt).toBeDefined();
			expect(session.updatedAt).toBeDefined();
			// Verify ISO timestamp format
			expect(new Date(session.createdAt).toISOString()).toBe(session.createdAt);
			expect(new Date(session.updatedAt).toISOString()).toBe(session.updatedAt);
		});

		it("should return session with null title when not set", async () => {
			db.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
				})
				.run();

			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as SessionsListResponse;
			expect(body.sessions.length).toBe(1);
			expect(body.sessions[0]?.title).toBeNull();
		});

		it("should only return sessions for the specified video", async () => {
			// Create another video
			const anotherVideo = db
				.insert(schema.videos)
				.values({
					userId: testUserId,
					youtubeUrl: "https://www.youtube.com/watch?v=another1234",
					youtubeId: "another1234",
					status: "completed",
					title: "Another Video",
				})
				.returning()
				.get();
			assertDefined(anotherVideo);

			// Create sessions for both videos
			db.insert(schema.chatSessions)
				.values({
					videoId: completedVideoId,
					userId: testUserId,
					title: "Session for Video 1",
				})
				.run();

			db.insert(schema.chatSessions)
				.values({
					videoId: anotherVideo.id,
					userId: testUserId,
					title: "Session for Video 2",
				})
				.run();

			const response = await app.handle(
				new Request(
					`http://localhost/api/videos/${completedVideoId}/sessions`,
					{
						method: "GET",
						headers: {
							Cookie: `session=${validToken}`,
						},
					},
				),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as SessionsListResponse;
			expect(body.sessions.length).toBe(1);
			expect(body.sessions[0]?.title).toBe("Session for Video 1");
		});
	});
});
