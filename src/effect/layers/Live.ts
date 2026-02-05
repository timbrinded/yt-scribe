/**
 * Live Layer Composition
 *
 * This file composes all Effect-TS services into a single production layer.
 * Layer composition follows the dependency order: leaf → dependent → orchestration.
 *
 * IMPORTANT: All composed layers are stored in constants to ensure memoization.
 * This means each service is instantiated exactly once, even when multiple
 * consumers depend on it.
 *
 * @example
 * ```typescript
 * import { LiveLayer } from "./layers/Live"
 * import { BunRuntime } from "@effect/platform-bun"
 *
 * const program = Effect.gen(function* () {
 *   const pipeline = yield* Pipeline
 *   return yield* pipeline.processVideo(1)
 * })
 *
 * BunRuntime.runMain(program.pipe(Effect.provide(LiveLayer)))
 * ```
 */

import { Layer } from "effect";
import { Database } from "../services/Database";
import { OpenAI } from "../services/OpenAI";
import { YouTube } from "../services/YouTube";
import { Progress } from "../services/Progress";
import { Transcription } from "../services/Transcription";
import { Chat } from "../services/Chat";
import { Clerk } from "../services/Clerk";
import { Pipeline } from "../services/Pipeline";
import { Analytics } from "../services/Analytics";

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/**
 * All services required by the application.
 * This type can be used to annotate effects that need the full application context.
 *
 * @example
 * ```typescript
 * const program: Effect.Effect<void, Error, AppRequirements> = Effect.gen(function* () {
 *   const pipeline = yield* Pipeline
 *   const clerk = yield* Clerk
 *   // ... use services
 * })
 * ```
 */
export type AppRequirements =
	| Database
	| OpenAI
	| YouTube
	| Progress
	| Transcription
	| Chat
	| Clerk
	| Pipeline
	| Analytics;

// =============================================================================
// LEAF LAYER
// =============================================================================

/**
 * Leaf services have no Effect-TS service dependencies.
 * They may read configuration from environment via Effect's Config.
 *
 * - Database: SQLite connection (Layer.scoped for lifecycle management)
 * - OpenAI: OpenAI SDK client (reads OPENAI_API_KEY)
 * - YouTube: URL validation and yt-dlp wrapper
 * - Progress: PubSub for progress events (Layer.scoped for lifecycle)
 * - Clerk: Clerk client for JWT verification (reads CLERK_SECRET_KEY)
 */
export const LeafLayer = Layer.mergeAll(
	Database.Live,
	OpenAI.Live,
	YouTube.Live,
	Progress.Live,
	Clerk.Live,
);

// =============================================================================
// DEPENDENT LAYER
// =============================================================================

/**
 * Transcription service depends on OpenAI for Whisper API access.
 */
const TranscriptionLayer = Transcription.Live.pipe(Layer.provide(OpenAI.Live));

/**
 * Chat service depends on OpenAI for GPT-4o access.
 */
const ChatLayer = Chat.Live.pipe(Layer.provide(OpenAI.Live));

/**
 * Analytics service depends on Database for event storage.
 */
const AnalyticsLayer = Analytics.Live.pipe(Layer.provide(Database.Live));

/**
 * Dependent services that require other services to function.
 * These are composed with their dependencies already provided.
 */
export const DependentLayer = Layer.mergeAll(
	TranscriptionLayer,
	ChatLayer,
	AnalyticsLayer,
);

// =============================================================================
// ORCHESTRATION LAYER
// =============================================================================

/**
 * Pipeline service depends on multiple services:
 * - Database: For video and transcript persistence
 * - YouTube: For audio download
 * - Transcription: For audio-to-text conversion
 * - Progress: For emitting progress events
 *
 * We merge LeafLayer and DependentLayer to provide all requirements.
 */
const PipelineLayer = Pipeline.Live.pipe(
	Layer.provide(Layer.merge(LeafLayer, DependentLayer)),
);

// =============================================================================
// LIVE LAYER (FULL APPLICATION)
// =============================================================================

/**
 * The complete production layer with all services composed.
 *
 * This layer provides:
 * - All leaf services (Database, OpenAI, YouTube, Progress, Clerk)
 * - All dependent services (Transcription, Chat, Analytics)
 * - Orchestration service (Pipeline)
 *
 * Usage:
 * ```typescript
 * import { LiveLayer } from "./layers/Live"
 *
 * const result = await Effect.runPromise(
 *   myProgram.pipe(Effect.provide(LiveLayer))
 * )
 * ```
 */
export const LiveLayer = Layer.mergeAll(LeafLayer, DependentLayer, PipelineLayer);
