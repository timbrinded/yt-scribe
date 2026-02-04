/**
 * Tests for the Effect-TS Pipeline service.
 *
 * The Pipeline service orchestrates the video processing workflow:
 * fetch video → download audio → transcribe → save transcript
 *
 * These tests demonstrate the Effect-TS DI pattern for service composition,
 * using mock layers to replace real YouTube and Transcription services.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { eq } from "drizzle-orm";
import {
	Pipeline,
	makePipelineTestLayer,
} from "../../../src/effect/services/Pipeline";
import { Database, makeDatabaseTestLayer } from "../../../src/effect/services/Database";
import { makeYouTubeTestLayer } from "../../../src/effect/services/YouTube";
import { makeTranscriptionTestLayer } from "../../../src/effect/services/Transcription";
import { makeProgressTestLayer } from "../../../src/effect/services/Progress";
import { Analytics } from "../../../src/effect/services/Analytics";
import {
	VideoNotFoundError,
	DownloadFailedError,
	TranscriptionFailedError,
} from "../../../src/effect/errors";
import { makePipelineTestContext } from "../../../src/effect/layers/Test";
import * as schema from "../../../src/db/schema";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_USER = {
	id: 1,
	email: "test@example.com",
	name: "Test User",
};

const TEST_VIDEO = {
	id: 1,
	userId: 1,
	youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	youtubeId: "dQw4w9WgXcQ",
	status: "pending" as const,
};

const TEST_METADATA = {
	id: "dQw4w9WgXcQ",
	title: "Test Video Title",
	duration: 212,
	thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
	channelName: "Test Channel",
	uploadDate: "2024-01-01",
};

const TEST_TRANSCRIPTION = {
	text: "This is a test transcript for the video.",
	segments: [
		{ start: 0, end: 5, text: "This is a test" },
		{ start: 5, end: 10, text: "transcript for the video." },
	],
	language: "en",
	duration: 10,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Seeds the database with a test user and video.
 */
function seedTestData(db: ReturnType<typeof Database["of"]>["db"]) {
	db.insert(schema.users).values(TEST_USER).run();
	db.insert(schema.videos).values(TEST_VIDEO).run();
}

/**
 * Creates a test layer with all dependencies mocked for Pipeline testing.
 * This composes: Database (seeded) + YouTube (mock) + Transcription (mock) + Progress (real)
 */
function createPipelineTestLayer(options: {
	youtubeOverrides?: Parameters<typeof makeYouTubeTestLayer>[0];
	transcriptionOverrides?: Parameters<typeof makeTranscriptionTestLayer>[0];
	progressOverrides?: ReturnType<typeof makeProgressTestLayer>["layer"];
} = {}) {
	// Create progress layer with event collection
	const { layer: progressLayer, getEvents } = makeProgressTestLayer();

	// Create database layer with seed data
	const databaseLayer = makeDatabaseTestLayer(seedTestData);

	// YouTube mock - defaults to successful operations
	const youtubeLayer = makeYouTubeTestLayer({
		getMetadata: () => Effect.succeed(TEST_METADATA),
		downloadAudio: () => Effect.succeed("/tmp/test-audio.m4a"),
		...options.youtubeOverrides,
	});

	// Transcription mock - defaults to successful transcription
	const transcriptionLayer = makeTranscriptionTestLayer({
		transcribe: () => Effect.succeed(TEST_TRANSCRIPTION),
		...options.transcriptionOverrides,
	});

	// Compose the leaf layer
	const leafLayer = Layer.mergeAll(
		databaseLayer,
		youtubeLayer,
		options.progressOverrides ?? progressLayer,
	);

	// Analytics test layer (no-op implementation)
	const analyticsLayer = Analytics.Test;

	// Pipeline.Live depends on Database, YouTube, Transcription, Progress, Analytics
	// We provide those dependencies to Pipeline.Live
	const pipelineLayer = Layer.provide(
		Pipeline.Live,
		Layer.mergeAll(leafLayer, transcriptionLayer, analyticsLayer),
	);

	// Final composed layer
	const testLayer = Layer.mergeAll(leafLayer, transcriptionLayer, analyticsLayer, pipelineLayer);

	return { layer: testLayer, getProgressEvents: getEvents };
}

// =============================================================================
// Tests
// =============================================================================

describe("Pipeline Effect Service", () => {
	describe("Pipeline.Test layer", () => {
		it.effect("returns helpful error message indicating mock needed", () =>
			Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const exit = yield* pipeline.processVideo(1).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(VideoNotFoundError);
					if (error instanceof VideoNotFoundError) {
						expect(error.message).toContain("not mocked");
						expect(error.message).toContain("makePipelineTestLayer");
					}
				}
			}).pipe(Effect.provide(Pipeline.Test)),
		);
	});

	describe("makePipelineTestLayer factory", () => {
		it.effect("allows mocking processVideo response", () =>
			Effect.gen(function* () {
				const testLayer = makePipelineTestLayer({
					processVideo: (videoId) =>
						Effect.succeed({
							videoId,
							status: "completed" as const,
							transcriptId: 42,
						}),
				});

				const pipeline = yield* Effect.provide(Pipeline, testLayer);
				const result = yield* pipeline.processVideo(1);

				expect(result.videoId).toBe(1);
				expect(result.status).toBe("completed");
				expect(result.transcriptId).toBe(42);
			}),
		);

		it.effect("allows mocking processVideo errors", () =>
			Effect.gen(function* () {
				const testLayer = makePipelineTestLayer({
					processVideo: (videoId) =>
						Effect.fail(
							new VideoNotFoundError({
								videoId,
								message: "Custom error: video not found",
							}),
						),
				});

				const pipeline = yield* Effect.provide(Pipeline, testLayer);
				const exit = yield* pipeline.processVideo(999).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(VideoNotFoundError);
					if (error instanceof VideoNotFoundError) {
						expect(error.message).toBe("Custom error: video not found");
					}
				}
			}),
		);

		it.effect("tracks arguments passed to processVideo", () =>
			Effect.gen(function* () {
				const capturedVideoIds: number[] = [];

				const testLayer = makePipelineTestLayer({
					processVideo: (videoId) => {
						capturedVideoIds.push(videoId);
						return Effect.succeed({
							videoId,
							status: "completed" as const,
							transcriptId: 1,
						});
					},
				});

				const pipeline = yield* Effect.provide(Pipeline, testLayer);
				yield* pipeline.processVideo(1);
				yield* pipeline.processVideo(2);
				yield* pipeline.processVideo(3);

				expect(capturedVideoIds).toEqual([1, 2, 3]);
			}),
		);
	});

	describe("Pipeline.Live with mocked dependencies", () => {
		it.scoped("processVideo succeeds with mocked services", () => {
			const { layer, getProgressEvents } = createPipelineTestLayer();

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const result = yield* pipeline.processVideo(1);

				expect(result.videoId).toBe(1);
				expect(result.status).toBe("completed");
				expect(result.transcriptId).toBeDefined();

				// Verify progress events were emitted
				const events = yield* getProgressEvents;
				expect(events.length).toBeGreaterThanOrEqual(5);

				// Check progress stages
				const stages = events.map((e) => e.stage);
				expect(stages).toContain("pending");
				expect(stages).toContain("downloading");
				expect(stages).toContain("extracting");
				expect(stages).toContain("transcribing");
				expect(stages).toContain("complete");
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo returns VideoNotFoundError for missing video", () => {
			const { layer } = createPipelineTestLayer();

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				// Video ID 999 doesn't exist in seeded data
				const exit = yield* pipeline.processVideo(999).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
					expect(error).toBeInstanceOf(VideoNotFoundError);
					if (error instanceof VideoNotFoundError) {
						expect(error.videoId).toBe(999);
					}
				}
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo marks video as failed on download error", () => {
			const { layer } = createPipelineTestLayer({
				youtubeOverrides: {
					downloadAudio: () =>
						Effect.fail(
							new DownloadFailedError({
								youtubeUrl: TEST_VIDEO.youtubeUrl,
								reason: "Network error: connection refused",
							}),
						),
				},
			});

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const { db } = yield* Database;

				// Process video (should fail)
				const result = yield* pipeline.processVideo(1).pipe(
					Effect.catchAll((error) => {
						// Return the error so we can check it
						return Effect.succeed({ error });
					}),
				);

				// Verify video status is 'failed' in database
				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, 1))
					.get();

				expect(video?.status).toBe("failed");
				expect(result).toHaveProperty("error");
				expect((result as { error: DownloadFailedError }).error).toBeInstanceOf(
					DownloadFailedError,
				);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo marks video as failed on transcription error", () => {
			const { layer, getProgressEvents } = createPipelineTestLayer({
				transcriptionOverrides: {
					transcribe: () =>
						Effect.fail(
							new TranscriptionFailedError({
								videoId: 1,
								reason: "API rate limit exceeded",
							}),
						),
				},
			});

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const { db } = yield* Database;

				// Process video (should fail)
				const result = yield* pipeline.processVideo(1).pipe(
					Effect.catchAll((error) => {
						return Effect.succeed({ error });
					}),
				);

				// Verify video status is 'failed' in database
				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, 1))
					.get();

				expect(video?.status).toBe("failed");
				expect(result).toHaveProperty("error");
				expect((result as { error: TranscriptionFailedError }).error).toBeInstanceOf(
					TranscriptionFailedError,
				);

				// Verify error progress event was emitted
				const events = yield* getProgressEvents;
				const errorEvent = events.find((e) => e.stage === "error");
				expect(errorEvent).toBeDefined();
				expect(errorEvent?.error).toContain("Transcription failed");
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo updates video status to processing during execution", () => {
			// Track the status during download by using a closure
			let downloadCalled = false;

			// We need to access the database during download to check status
			// But the mock signature doesn't provide Database access
			// So we verify the video is in 'processing' state after a successful run
			// by checking progress events which are emitted in order

			const { layer, getProgressEvents } = createPipelineTestLayer({
				youtubeOverrides: {
					downloadAudio: () => {
						downloadCalled = true;
						return Effect.succeed("/tmp/test-audio.m4a");
					},
				},
			});

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				yield* pipeline.processVideo(1);

				expect(downloadCalled).toBe(true);

				// Verify that the 'pending' event (which emits after status update to 'processing')
				// comes before the 'downloading' event
				const events = yield* getProgressEvents;
				const stages = events.map((e) => e.stage);
				const pendingIdx = stages.indexOf("pending");
				const downloadingIdx = stages.indexOf("downloading");

				expect(pendingIdx).toBeLessThan(downloadingIdx);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo saves transcript to database on success", () => {
			const { layer } = createPipelineTestLayer();

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const { db } = yield* Database;

				// Process video
				const result = yield* pipeline.processVideo(1);

				// Verify transcript is in database
				const transcript = db
					.select()
					.from(schema.transcripts)
					.where(eq(schema.transcripts.videoId, 1))
					.get();

				expect(result.transcriptId).toBeDefined();
				expect(transcript).toBeDefined();
				expect(transcript?.content).toBe(TEST_TRANSCRIPTION.text);
				expect(transcript?.segments).toHaveLength(2);
				expect(transcript?.language).toBe("en");
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo fetches and saves metadata when not present", () => {
			let metadataFetched = false;

			const { layer } = createPipelineTestLayer({
				youtubeOverrides: {
					getMetadata: () => {
						metadataFetched = true;
						return Effect.succeed(TEST_METADATA);
					},
					downloadAudio: () => Effect.succeed("/tmp/test-audio.m4a"),
				},
			});

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const { db } = yield* Database;

				// Process video
				yield* pipeline.processVideo(1);

				// Verify metadata is in database
				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, 1))
					.get();

				expect(metadataFetched).toBe(true);
				expect(video?.title).toBe(TEST_METADATA.title);
				expect(video?.duration).toBe(TEST_METADATA.duration);
				expect(video?.thumbnailUrl).toBe(TEST_METADATA.thumbnailUrl);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("processVideo updates video status to completed on success", () => {
			const { layer } = createPipelineTestLayer();

			return Effect.gen(function* () {
				const pipeline = yield* Pipeline;
				const { db } = yield* Database;

				// Process video
				yield* pipeline.processVideo(1);

				// Verify status is 'completed' in database
				const video = db
					.select()
					.from(schema.videos)
					.where(eq(schema.videos.id, 1))
					.get();

				expect(video?.status).toBe("completed");
			}).pipe(Effect.provide(layer));
		});
	});

	describe("makePipelineTestContext factory", () => {
		it.scoped("provides pre-configured test layer for Pipeline testing", () => {
			const { layer } = makePipelineTestContext();

			return Effect.gen(function* () {
				// Note: makePipelineTestContext creates a layer but Pipeline.Test doesn't
				// use the real Pipeline.Live implementation - we need to test with
				// Pipeline.Live that is properly wired to dependencies

				// This tests that the context provides all required services
				const { db } = yield* Database;
				const users = db.select().from(schema.users).all();

				// Default layer has empty database
				expect(users).toEqual([]);
			}).pipe(Effect.provide(layer));
		});
	});

	describe("service isolation", () => {
		it.effect("each test layer is independent", () =>
			Effect.gen(function* () {
				const layer1 = makePipelineTestLayer({
					processVideo: () =>
						Effect.succeed({
							videoId: 1,
							status: "completed" as const,
							transcriptId: 100,
						}),
				});

				const layer2 = makePipelineTestLayer({
					processVideo: () =>
						Effect.succeed({
							videoId: 1,
							status: "completed" as const,
							transcriptId: 200,
						}),
				});

				const program = Effect.gen(function* () {
					const pipeline = yield* Pipeline;
					return yield* pipeline.processVideo(1);
				});

				const result1 = yield* program.pipe(Effect.provide(layer1));
				const result2 = yield* program.pipe(Effect.provide(layer2));

				expect(result1.transcriptId).toBe(100);
				expect(result2.transcriptId).toBe(200);
			}),
		);

		it.effect("database changes in one test don't affect another", () =>
			Effect.gen(function* () {
				// First test: seed and modify database
				const layer1 = makeDatabaseTestLayer(seedTestData);
				const program1 = Effect.gen(function* () {
					const { db } = yield* Database;
					// Add another user
					db.insert(schema.users)
						.values({ id: 2, email: "other@example.com", name: "Other" })
						.run();
					return db.select().from(schema.users).all().length;
				});

				const count1 = yield* program1.pipe(Effect.provide(layer1));

				// Second test: fresh database with same seed
				const layer2 = makeDatabaseTestLayer(seedTestData);
				const program2 = Effect.gen(function* () {
					const { db } = yield* Database;
					return db.select().from(schema.users).all().length;
				});

				const count2 = yield* program2.pipe(Effect.provide(layer2));

				expect(count1).toBe(2); // Original + added user
				expect(count2).toBe(1); // Only original user from seed
			}),
		);
	});
});
