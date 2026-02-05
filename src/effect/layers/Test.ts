/**
 * Test Layer Composition
 *
 * Provides test layers and factory functions for creating partially mocked
 * environments in tests. The test layer uses mock implementations that don't
 * make real network calls or require external resources.
 *
 * Key concepts:
 * - TestLayer: Default test layer with all services mocked
 * - makeTestLayer(): Factory for creating layers with partial overrides
 *
 * @example
 * ```typescript
 * import { TestLayer, makeTestLayer } from "./layers/Test"
 * import { Effect } from "effect"
 *
 * // Use default test layer
 * const result = await Effect.runPromise(
 *   program.pipe(Effect.provide(TestLayer))
 * )
 *
 * // Use partial mock (only override YouTube service)
 * const customLayer = makeTestLayer({
 *   youtube: makeYouTubeTestLayer({
 *     downloadAudio: () => Effect.succeed("/tmp/test.m4a")
 *   })
 * })
 * const result2 = await Effect.runPromise(
 *   program.pipe(Effect.provide(customLayer))
 * )
 * ```
 */

import { Effect, Layer } from "effect";
import { Database, makeDatabaseTestLayer } from "../services/Database";
import { OpenAI, makeOpenAITestLayer } from "../services/OpenAI";
import { YouTube, makeYouTubeTestLayer } from "../services/YouTube";
import {
	Progress,
	makeProgressTestLayer,
	makeProgressMockLayer,
} from "../services/Progress";
import {
	Transcription,
	makeTranscriptionTestLayer,
} from "../services/Transcription";
import { Chat, makeChatTestLayer } from "../services/Chat";
import { Clerk, makeClerkTestLayer } from "../services/Clerk";
import { Pipeline, makePipelineTestLayer } from "../services/Pipeline";
import { Analytics, makeAnalyticsTestLayer } from "../services/Analytics";
import type { AppRequirements } from "./Live";

// =============================================================================
// RE-EXPORT TEST FACTORIES
// =============================================================================

// Re-export factory functions for convenience
export {
	makeDatabaseTestLayer,
	makeOpenAITestLayer,
	makeYouTubeTestLayer,
	makeProgressTestLayer,
	makeProgressMockLayer,
	makeTranscriptionTestLayer,
	makeChatTestLayer,
	makeClerkTestLayer,
	makePipelineTestLayer,
	makeAnalyticsTestLayer,
};

// =============================================================================
// DEFAULT TEST LAYERS
// =============================================================================

/**
 * Default leaf services for testing.
 * - Database: In-memory SQLite with test schema
 * - OpenAI: Mock client that throws helpful errors
 * - YouTube: URL validation works, download/metadata fail with helpful errors
 * - Progress: In-memory event collection
 * - Clerk: Mock JWT verification
 */
export const TestLeafLayer = Layer.mergeAll(
	Database.Test,
	OpenAI.Test,
	YouTube.Test,
	Progress.Test,
	Clerk.Test,
);

/**
 * Default dependent services for testing.
 * These are wired with Test versions of their dependencies.
 */
const TestTranscriptionLayer = Transcription.Test;
const TestChatLayer = Chat.Test;
const TestAnalyticsLayer = Analytics.Test;

export const TestDependentLayer = Layer.mergeAll(
	TestTranscriptionLayer,
	TestChatLayer,
	TestAnalyticsLayer,
);

/**
 * Default orchestration services for testing.
 */
const TestPipelineLayer = Pipeline.Test;

/**
 * Complete test layer with all services mocked.
 *
 * This is suitable for tests that don't need any real service behavior.
 * For tests that need partial real behavior, use makeTestLayer().
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(
 *   Effect.scoped(
 *     program.pipe(Effect.provide(TestLayer))
 *   )
 * )
 * ```
 */
export const TestLayer = Layer.mergeAll(
	TestLeafLayer,
	TestDependentLayer,
	TestPipelineLayer,
);

// =============================================================================
// TEST LAYER FACTORY
// =============================================================================

/**
 * Options for creating a custom test layer.
 * Provide overrides for specific services; others will use default test implementations.
 */
export interface TestLayerOptions {
	/** Override Database service */
	database?: Layer.Layer<Database>;
	/** Override OpenAI service */
	openai?: Layer.Layer<OpenAI>;
	/** Override YouTube service */
	youtube?: Layer.Layer<YouTube>;
	/** Override Progress service */
	progress?: Layer.Layer<Progress>;
	/** Override Transcription service */
	transcription?: Layer.Layer<Transcription>;
	/** Override Chat service */
	chat?: Layer.Layer<Chat>;
	/** Override Clerk service */
	clerk?: Layer.Layer<Clerk>;
	/** Override Pipeline service */
	pipeline?: Layer.Layer<Pipeline>;
	/** Override Analytics service */
	analytics?: Layer.Layer<Analytics>;
}

/**
 * Creates a test layer with partial mock overrides.
 *
 * This factory allows you to override specific services while keeping
 * default test implementations for others. Useful for integration tests
 * that need specific service behaviors.
 *
 * @param options - Partial overrides for services
 * @returns A composed layer with all services
 *
 * @example
 * ```typescript
 * // Test with custom YouTube behavior
 * const testLayer = makeTestLayer({
 *   youtube: makeYouTubeTestLayer({
 *     downloadAudio: (url) => Effect.succeed("/tmp/test-audio.m4a"),
 *     getMetadata: (url) => Effect.succeed({
 *       id: "test123",
 *       title: "Test Video",
 *       duration: 60,
 *       thumbnailUrl: "https://example.com/thumb.jpg",
 *       channelName: "Test Channel",
 *       uploadDate: "2024-01-01",
 *     }),
 *   }),
 * })
 *
 * const result = await Effect.runPromise(
 *   Effect.scoped(
 *     Effect.gen(function* () {
 *       const youtube = yield* YouTube
 *       return yield* youtube.downloadAudio("https://youtube.com/watch?v=test123")
 *     }).pipe(Effect.provide(testLayer))
 *   )
 * )
 * ```
 *
 * @example
 * ```typescript
 * // Test with real Database but mocked external services
 * const testLayer = makeTestLayer({
 *   database: Database.Live, // Use real SQLite
 *   transcription: makeTranscriptionTestLayer({
 *     transcribe: () => Effect.succeed({
 *       text: "Test transcript",
 *       segments: [{ start: 0, end: 5, text: "Test" }],
 *       language: "en",
 *       duration: 5,
 *     }),
 *   }),
 * })
 * ```
 */
export function makeTestLayer(
	options: TestLayerOptions = {},
): Layer.Layer<AppRequirements> {
	// Leaf layer with overrides
	const leafLayer = Layer.mergeAll(
		options.database ?? Database.Test,
		options.openai ?? OpenAI.Test,
		options.youtube ?? YouTube.Test,
		options.progress ?? Progress.Test,
		options.clerk ?? Clerk.Test,
	);

	// Dependent layer with overrides
	const dependentLayer = Layer.mergeAll(
		options.transcription ?? Transcription.Test,
		options.chat ?? Chat.Test,
		options.analytics ?? Analytics.Test,
	);

	// Orchestration layer with override
	const orchestrationLayer = options.pipeline ?? Pipeline.Test;

	return Layer.mergeAll(leafLayer, dependentLayer, orchestrationLayer);
}

// =============================================================================
// SPECIALIZED TEST FACTORIES
// =============================================================================

/**
 * Creates a test layer with in-memory database pre-seeded with test data.
 *
 * Useful for tests that need realistic database state without network calls.
 *
 * @param seed - Function to seed the database with test data
 * @param overrides - Additional service overrides
 *
 * @example
 * ```typescript
 * const testLayer = makeSeededTestLayer(
 *   (db) => {
 *     // Seed a test user
 *     db.insert(schema.users).values({
 *       email: "test@example.com",
 *       name: "Test User",
 *     }).run()
 *
 *     // Seed a test video
 *     db.insert(schema.videos).values({
 *       userId: 1,
 *       youtubeUrl: "https://youtube.com/watch?v=test123",
 *       youtubeId: "test123",
 *       status: "pending",
 *     }).run()
 *   },
 *   {
 *     // Additional overrides
 *     youtube: makeYouTubeTestLayer({...}),
 *   }
 * )
 * ```
 */
export function makeSeededTestLayer(
	seed: Parameters<typeof makeDatabaseTestLayer>[0],
	overrides: Omit<TestLayerOptions, "database"> = {},
): Layer.Layer<AppRequirements> {
	return makeTestLayer({
		...overrides,
		database: makeDatabaseTestLayer(seed),
	});
}

/**
 * Creates a test layer suitable for Pipeline service testing.
 *
 * Pre-configures:
 * - In-memory database with schema
 * - Mock YouTube service that returns success
 * - Mock Transcription service that returns success
 * - Real Progress service for event testing
 *
 * @param options - Override any of the pre-configured services
 *
 * @example
 * ```typescript
 * const { layer, getProgressEvents } = makePipelineTestContext()
 *
 * const result = await Effect.runPromise(
 *   Effect.scoped(
 *     Effect.gen(function* () {
 *       const pipeline = yield* Pipeline
 *       return yield* pipeline.processVideo(1)
 *     }).pipe(Effect.provide(layer))
 *   )
 * )
 *
 * // Verify progress events were emitted
 * const events = await Effect.runPromise(getProgressEvents)
 * expect(events).toHaveLength(5) // pending, downloading, extracting, transcribing, complete
 * ```
 */
export function makePipelineTestContext(
	options: {
		youtubeOverrides?: Parameters<typeof makeYouTubeTestLayer>[0];
		transcriptionOverrides?: Parameters<typeof makeTranscriptionTestLayer>[0];
	} = {},
): {
	layer: Layer.Layer<AppRequirements>;
	getProgressEvents: ReturnType<typeof makeProgressTestLayer>["getEvents"];
} {
	// Progress service with event collection
	const { layer: progressLayer, getEvents } = makeProgressTestLayer();

	// YouTube mock with defaults
	const youtubeLayer = makeYouTubeTestLayer({
		getMetadata: () =>
			Effect.succeed({
				id: "test123",
				title: "Test Video",
				duration: 60,
				thumbnailUrl: "https://i.ytimg.com/vi/test123/hqdefault.jpg",
				channelName: "Test Channel",
				uploadDate: "2024-01-01",
			}),
		downloadAudio: () => Effect.succeed("/tmp/test-audio.m4a"),
		...options.youtubeOverrides,
	});

	// Transcription mock with defaults
	const transcriptionLayer = makeTranscriptionTestLayer({
		transcribe: () =>
			Effect.succeed({
				text: "This is a test transcript.",
				segments: [
					{ start: 0, end: 5, text: "This is a test" },
					{ start: 5, end: 10, text: "transcript." },
				],
				language: "en",
				duration: 10,
			}),
		...options.transcriptionOverrides,
	});

	// Compose the full test layer
	const layer = makeTestLayer({
		progress: progressLayer,
		youtube: youtubeLayer,
		transcription: transcriptionLayer,
	});

	return { layer, getProgressEvents: getEvents };
}
