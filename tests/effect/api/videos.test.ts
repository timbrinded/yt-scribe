/**
 * Effect-TS API Integration Tests for Video Endpoints
 *
 * These tests verify the video API endpoints using HttpApiBuilder.toWebHandler
 * to create a test handler without starting an actual HTTP server.
 *
 * Tests cover:
 * - POST /api/videos - Create a new video for transcription
 * - GET /api/videos - List user's video library
 * - GET /api/videos/:id - Get video details with transcript
 * - Unauthorized access (401) handling
 * - Forbidden access (403) handling
 *
 * The tests use makeTestLayer() for fully mocked service dependencies
 * and test the complete request/response cycle including authorization.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { Effect, Layer } from "effect";
import { YTScribeApi } from "../../../src/effect/api";
import { VideosGroupLive } from "../../../src/effect/api/handlers/videos";
import { ChatGroupLive } from "../../../src/effect/api/handlers/chat";
import { AuthGroupLive } from "../../../src/effect/api/handlers/auth";
import { AdminGroupLive } from "../../../src/effect/api/handlers/admin";
import { HealthGroupLive } from "../../../src/effect/api/handlers/health";
import { makeAuthorizationTestLayer } from "../../../src/effect/api/middleware/auth";
import { Database, makeDatabaseTestLayer } from "../../../src/effect/services/Database";
import { makeYouTubeTestLayer } from "../../../src/effect/services/YouTube";
import { makePipelineTestLayer } from "../../../src/effect/services/Pipeline";
import {
	makeTestLayer,
	makeChatTestLayer,
} from "../../../src/effect/layers/Test";
import { UnauthorizedError } from "../../../src/effect/errors";
import * as schema from "../../../src/db/schema";

// =============================================================================
// Response Types (for type assertions)
// =============================================================================

interface VideoResponse {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	title: string | null;
	status: string;
	createdAt: string;
	transcript?: {
		content: string;
		segments: Array<{ start: number; end: number; text: string }>;
		language: string;
	} | null;
}

interface VideoListResponse {
	videos: VideoResponse[];
	count: number;
	limit: number;
	offset: number;
}

interface DuplicateErrorResponse {
	existingId: number;
}

interface RetryResponse {
	id: number;
	status: string;
	message: string;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_USER = {
	id: 1,
	email: "test@example.com",
	name: "Test User",
	avatarUrl: null,
};

const OTHER_USER = {
	id: 2,
	email: "other@example.com",
	name: "Other User",
	avatarUrl: null,
};

const VALID_YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const INVALID_YOUTUBE_URL = "https://invalid-url.com/video";

// =============================================================================
// Test Helper: Create API Handler
// =============================================================================

/**
 * Creates a web handler for testing the API with all dependencies mocked.
 * Uses HttpApiBuilder.toWebHandler to create a handler that can be tested
 * directly without starting an HTTP server.
 *
 * @param options - Configuration for the test layer
 * @param options.user - The authenticated user (null for unauthenticated requests)
 * @param options.seedDatabase - Function to seed the database with test data
 * @returns A handler function and dispose callback
 */
function createTestHandler(options: {
	user?: typeof TEST_USER | null;
	seedDatabase?: (db: ReturnType<typeof Database["of"]>["db"]) => void;
} = {}) {
	const { user = TEST_USER, seedDatabase } = options;

	// Create database layer with optional seed function
	const databaseLayer = makeDatabaseTestLayer((db) => {
		// Seed default test user
		db.insert(schema.users).values(TEST_USER).run();
		db.insert(schema.users).values(OTHER_USER).run();
		// Run custom seed function if provided
		seedDatabase?.(db);
	});

	// Create YouTube mock that validates URLs but returns mock metadata
	const youtubeLayer = makeYouTubeTestLayer({
		getMetadata: (_url) =>
			Effect.succeed({
				id: "dQw4w9WgXcQ",
				title: "Test Video Title",
				duration: 212,
				thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
				channelName: "Test Channel",
				uploadDate: "2024-01-01",
			}),
		downloadAudio: (_url) => Effect.succeed("/tmp/test-audio.m4a"),
	});

	// Create Pipeline mock that succeeds immediately
	const pipelineLayer = makePipelineTestLayer({
		processVideo: (videoId) =>
			Effect.succeed({
				videoId,
				status: "completed" as const,
				transcriptId: 1,
			}),
	});

	// Create authorization layer based on user
	const authorizationLayer = user
		? makeAuthorizationTestLayer({
				bearer: () => Effect.succeed(user),
			})
		: makeAuthorizationTestLayer({
				bearer: () => Effect.fail(new UnauthorizedError()),
			});

	// Create chat mock layer (only chatComplete, chat is streaming version)
	const chatLayer = makeChatTestLayer({
		chatComplete: () => Effect.succeed("Mock chat response"),
	});

	// Create test layer with all services
	// Note: With Clerk auth, there's no Auth service to mock
	// Authorization is handled by the authorizationLayer above
	const testLayer = makeTestLayer({
		database: databaseLayer,
		youtube: youtubeLayer,
		pipeline: pipelineLayer,
		chat: chatLayer,
	});

	// All handler groups (YTScribeApi requires all groups)
	const HandlersLive = Layer.mergeAll(
		VideosGroupLive,
		ChatGroupLive,
		AuthGroupLive,
		AdminGroupLive,
		HealthGroupLive,
	);

	// Build the API layer
	const ApiLive = HttpApiBuilder.api(YTScribeApi).pipe(
		Layer.provide(HandlersLive),
		Layer.provide(authorizationLayer),
		Layer.provide(testLayer),
	);

	// Create web handler
	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(ApiLive, HttpServer.layerContext),
	);
}

/**
 * Helper to make authenticated requests to the test handler
 */
async function makeRequest(
	handler: (request: Request) => Promise<Response>,
	options: {
		method: "GET" | "POST" | "PUT" | "DELETE";
		path: string;
		body?: object;
		token?: string;
	},
): Promise<Response> {
	const { method, path, body, token = "test-token" } = options;
	const url = `http://localhost${path}`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}

	const request = new Request(url, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});

	return handler(request);
}

// =============================================================================
// Tests: POST /api/videos
// =============================================================================

describe("POST /api/videos", () => {
	it.effect("creates video and returns 201 for valid YouTube URL", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler();

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos",
						body: { url: VALID_YOUTUBE_URL },
					}),
				);

				expect(response.status).toBe(201);

				const data = yield* Effect.promise(() => response.json() as Promise<VideoResponse>);
				expect(data.id).toBeDefined();
				expect(data.youtubeUrl).toBe(VALID_YOUTUBE_URL);
				expect(data.youtubeId).toBe("dQw4w9WgXcQ");
				expect(data.status).toBe("pending");
				expect(data.createdAt).toBeDefined();
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 400 for invalid YouTube URL", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler();

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos",
						body: { url: INVALID_YOUTUBE_URL },
					}),
				);

				expect(response.status).toBe(400);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 409 for duplicate video", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					// Seed an existing video
					db.insert(schema.videos)
						.values({
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "completed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos",
						body: { url: VALID_YOUTUBE_URL },
					}),
				);

				expect(response.status).toBe(409);
				const data = yield* Effect.promise(() => response.json() as Promise<DuplicateErrorResponse>);
				expect(data.existingId).toBeDefined();
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 401 without authorization", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({ user: null });

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos",
						body: { url: VALID_YOUTUBE_URL },
						token: "", // No token
					}),
				);

				expect(response.status).toBe(401);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("accepts various YouTube URL formats", () =>
		Effect.gen(function* () {
			const urls = [
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				"https://youtu.be/dQw4w9WgXcQ",
				"https://www.youtube.com/shorts/dQw4w9WgXcQ",
				"https://www.youtube.com/embed/dQw4w9WgXcQ",
			];

			for (const url of urls) {
				const { handler, dispose } = createTestHandler();

				try {
					const response = yield* Effect.promise(() =>
						makeRequest(handler, {
							method: "POST",
							path: "/api/videos",
							body: { url },
						}),
					);

					// Should be 201 (created) or 409 (duplicate) but not 400 (invalid URL)
					expect([201, 409]).toContain(response.status);
				} finally {
					yield* Effect.promise(() => dispose());
				}
			}
		}),
	);
});

// =============================================================================
// Tests: GET /api/videos
// =============================================================================

describe("GET /api/videos", () => {
	it.effect("returns empty array for user with no videos", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler();

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos",
					}),
				);

				expect(response.status).toBe(200);
				const data = yield* Effect.promise(() => response.json() as Promise<VideoListResponse>);
				expect(data.videos).toEqual([]);
				expect(data.count).toBe(0);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns only current user's videos", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					// Add video for test user
					db.insert(schema.videos)
						.values({
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "user1video",
							status: "completed",
						})
						.run();

					// Add video for other user
					db.insert(schema.videos)
						.values({
							userId: OTHER_USER.id,
							youtubeUrl: "https://youtube.com/watch?v=other",
							youtubeId: "otheruser",
							status: "completed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos",
					}),
				);

				expect(response.status).toBe(200);
				const data = yield* Effect.promise(() => response.json() as Promise<VideoListResponse>);
				expect(data.videos).toHaveLength(1);
				expect(data.videos[0]!.youtubeId).toBe("user1video");
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("supports pagination with limit and offset", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					// Add multiple videos
					for (let i = 0; i < 5; i++) {
						db.insert(schema.videos)
							.values({
								userId: TEST_USER.id,
								youtubeUrl: `https://youtube.com/watch?v=video${i}`,
								youtubeId: `video${i}`,
								status: "completed",
							})
							.run();
					}
				},
			});

			try {
				// Test limit
				const response1 = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos?limit=2",
					}),
				);

				expect(response1.status).toBe(200);
				const data1 = yield* Effect.promise(() => response1.json() as Promise<VideoListResponse>);
				expect(data1.videos).toHaveLength(2);
				expect(data1.limit).toBe(2);

				// Test offset
				const response2 = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos?offset=3",
					}),
				);

				expect(response2.status).toBe(200);
				const data2 = yield* Effect.promise(() => response2.json() as Promise<VideoListResponse>);
				expect(data2.videos).toHaveLength(2); // 5 - 3 = 2
				expect(data2.offset).toBe(3);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 401 without authorization", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({ user: null });

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos",
						token: "",
					}),
				);

				expect(response.status).toBe(401);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);
});

// =============================================================================
// Tests: GET /api/videos/:id
// =============================================================================

describe("GET /api/videos/:id", () => {
	it.effect("returns video details for owned video", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							title: "Test Video",
							status: "completed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos/1",
					}),
				);

				expect(response.status).toBe(200);
				const data = yield* Effect.promise(() => response.json() as Promise<VideoResponse>);
				expect(data.id).toBe(1);
				expect(data.title).toBe("Test Video");
				expect(data.status).toBe("completed");
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns transcript when video is completed", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					// Add completed video
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "completed",
						})
						.run();

					// Add transcript
					db.insert(schema.transcripts)
						.values({
							id: 1,
							videoId: 1,
							content: "This is the transcript content",
							segments: [
								{ start: 0, end: 5, text: "This is" },
								{ start: 5, end: 10, text: "the transcript content" },
							],
							language: "en",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos/1",
					}),
				);

				expect(response.status).toBe(200);
				const data = yield* Effect.promise(() => response.json() as Promise<VideoResponse>);
				expect(data.transcript).toBeDefined();
				expect(data.transcript!.content).toBe("This is the transcript content");
				expect(data.transcript!.segments).toHaveLength(2);
				expect(data.transcript!.language).toBe("en");
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns null transcript for pending video", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "pending",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos/1",
					}),
				);

				expect(response.status).toBe(200);
				const data = yield* Effect.promise(() => response.json() as Promise<VideoResponse>);
				expect(data.transcript).toBeNull();
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 404 for non-existent video", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler();

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos/999",
					}),
				);

				expect(response.status).toBe(404);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 403 for video owned by another user", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					// Add video owned by other user
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: OTHER_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "completed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos/1",
					}),
				);

				expect(response.status).toBe(403);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 401 without authorization", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({ user: null });

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "GET",
						path: "/api/videos/1",
						token: "",
					}),
				);

				expect(response.status).toBe(401);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);
});

// =============================================================================
// Tests: POST /api/videos/:id/retry
// =============================================================================

describe("POST /api/videos/:id/retry", () => {
	it.effect("retries failed video and returns 200", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "failed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos/1/retry",
					}),
				);

				expect(response.status).toBe(200);
				const data = yield* Effect.promise(() => response.json() as Promise<RetryResponse>);
				expect(data.id).toBe(1);
				expect(data.status).toBe("pending");
				expect(data.message).toContain("retry");
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 400 when video is not in failed state", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: TEST_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "completed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos/1/retry",
					}),
				);

				expect(response.status).toBe(400);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 404 for non-existent video", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler();

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos/999/retry",
					}),
				);

				expect(response.status).toBe(404);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 403 for video owned by another user", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({
				seedDatabase: (db) => {
					db.insert(schema.videos)
						.values({
							id: 1,
							userId: OTHER_USER.id,
							youtubeUrl: VALID_YOUTUBE_URL,
							youtubeId: "dQw4w9WgXcQ",
							status: "failed",
						})
						.run();
				},
			});

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos/1/retry",
					}),
				);

				expect(response.status).toBe(403);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);

	it.effect("returns 401 without authorization", () =>
		Effect.gen(function* () {
			const { handler, dispose } = createTestHandler({ user: null });

			try {
				const response = yield* Effect.promise(() =>
					makeRequest(handler, {
						method: "POST",
						path: "/api/videos/1/retry",
						token: "",
					}),
				);

				expect(response.status).toBe(401);
			} finally {
				yield* Effect.promise(() => dispose());
			}
		}),
	);
});
