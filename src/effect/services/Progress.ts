/**
 * Progress Effect Service
 *
 * Provides real-time progress updates for video processing via PubSub.
 * This is a leaf service with no Effect-TS service dependencies.
 *
 * Uses Effect PubSub for pub/sub messaging and Stream for subscriptions.
 * The service is scoped because PubSub requires lifecycle management.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const progress = yield* Progress
 *
 *   // Emit a progress event
 *   yield* progress.emit({
 *     videoId: 1,
 *     stage: "downloading",
 *     progress: 50,
 *     message: "Downloading audio...",
 *     timestamp: new Date().toISOString(),
 *   })
 *
 *   // Subscribe to events for a specific video
 *   const stream = progress.subscribe(1)
 *
 *   // Subscribe to all events
 *   const allStream = progress.subscribeAll()
 * })
 *
 * // Run with live implementation (scoped for PubSub lifecycle)
 * await Effect.runPromise(
 *   Effect.scoped(program.pipe(Effect.provide(Progress.Live)))
 * )
 * ```
 */

import { Context, Effect, Layer, PubSub, Queue, Stream } from "effect";
import type { ProgressEvent, ProgressService } from "./types";

// =============================================================================
// HELPER FUNCTION
// =============================================================================

/**
 * Creates a ProgressEvent with current timestamp.
 * Convenience function for emitting events without manually creating timestamps.
 */
export function createProgressEvent(
	params: Omit<ProgressEvent, "timestamp">,
): ProgressEvent {
	return {
		...params,
		timestamp: new Date().toISOString(),
	};
}

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Progress service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const progress = yield* Progress
 *
 * // Emit progress
 * yield* progress.emit(event)
 *
 * // Subscribe to specific video
 * const stream = progress.subscribe(videoId)
 *
 * // Subscribe to all
 * const allStream = progress.subscribeAll()
 * ```
 */
export class Progress extends Context.Tag("@ytscribe/Progress")<
	Progress,
	ProgressService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer using Effect PubSub for real-time progress events.
	 *
	 * Uses Layer.scoped because PubSub is a resource with lifecycle.
	 * The PubSub is unbounded to avoid backpressure issues with slow consumers.
	 */
	static readonly Live = Layer.scoped(
		Progress,
		Effect.gen(function* () {
			// Create unbounded PubSub for progress events
			// Unbounded means publishers never wait - events are buffered
			const pubsub = yield* PubSub.unbounded<ProgressEvent>();

			// Register finalizer to log PubSub cleanup
			yield* Effect.addFinalizer(() =>
				Effect.logDebug("Progress PubSub shutting down..."),
			);

			return {
				emit: (event: ProgressEvent) =>
					Effect.gen(function* () {
						yield* PubSub.publish(pubsub, event);
					}),

				subscribe: (videoId: number) =>
					Stream.unwrapScoped(
						Effect.gen(function* () {
							// Subscribe to pubsub to get a dequeue
							const dequeue = yield* PubSub.subscribe(pubsub);

							// Filter to only events for this video
							return Stream.fromQueue(dequeue).pipe(
								Stream.filter((event) => event.videoId === videoId),
							);
						}),
					),

				subscribeAll: () =>
					Stream.unwrapScoped(
						Effect.gen(function* () {
							// Subscribe to pubsub to get a dequeue
							const dequeue = yield* PubSub.subscribe(pubsub);
							return Stream.fromQueue(dequeue);
						}),
					),
			} satisfies ProgressService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer with in-memory event collection for assertions.
	 *
	 * Uses makeProgressTestLayer() for the implementation to allow
	 * accessing emitted events in tests.
	 */
	static readonly Test = Layer.scoped(
		Progress,
		Effect.gen(function* () {
			// Use a simple unbounded queue to collect events for testing
			const pubsub = yield* PubSub.unbounded<ProgressEvent>();

			return {
				emit: (event: ProgressEvent) =>
					Effect.gen(function* () {
						yield* PubSub.publish(pubsub, event);
					}),

				subscribe: (videoId: number) =>
					Stream.unwrapScoped(
						Effect.gen(function* () {
							const dequeue = yield* PubSub.subscribe(pubsub);
							return Stream.fromQueue(dequeue).pipe(
								Stream.filter((event) => event.videoId === videoId),
							);
						}),
					),

				subscribeAll: () =>
					Stream.unwrapScoped(
						Effect.gen(function* () {
							const dequeue = yield* PubSub.subscribe(pubsub);
							return Stream.fromQueue(dequeue);
						}),
					),
			} satisfies ProgressService;
		}),
	);
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Test context for collecting and inspecting emitted progress events.
 */
export interface ProgressTestContext {
	/** The progress service */
	readonly service: ProgressService;
	/** Queue containing all emitted events for inspection */
	readonly events: Queue.Queue<ProgressEvent>;
}

/**
 * Factory function for creating test layers with event collection.
 *
 * Returns both the service and a queue for collecting emitted events,
 * allowing tests to verify events were emitted correctly.
 *
 * @example
 * ```typescript
 * const { layer, getEvents } = makeProgressTestLayer()
 *
 * const program = Effect.gen(function* () {
 *   const progress = yield* Progress
 *
 *   yield* progress.emit(createProgressEvent({
 *     videoId: 1,
 *     stage: "downloading",
 *     progress: 50,
 *     message: "Downloading...",
 *   }))
 *
 *   // Check emitted events
 *   const events = yield* getEvents
 *   // events = [{ videoId: 1, stage: "downloading", ... }]
 * })
 *
 * await Effect.runPromise(
 *   Effect.scoped(program.pipe(Effect.provide(layer)))
 * )
 * ```
 */
export function makeProgressTestLayer(): {
	layer: Layer.Layer<Progress>;
	/** Effect to get all emitted events (call after running program) */
	getEvents: Effect.Effect<ReadonlyArray<ProgressEvent>, never, Progress>;
} {
	// Shared state for collecting events
	const collectedEvents: ProgressEvent[] = [];

	const layer = Layer.scoped(
		Progress,
		Effect.gen(function* () {
			const pubsub = yield* PubSub.unbounded<ProgressEvent>();

			return {
				emit: (event: ProgressEvent) =>
					Effect.gen(function* () {
						collectedEvents.push(event);
						yield* PubSub.publish(pubsub, event);
					}),

				subscribe: (videoId: number) =>
					Stream.unwrapScoped(
						Effect.gen(function* () {
							const dequeue = yield* PubSub.subscribe(pubsub);
							return Stream.fromQueue(dequeue).pipe(
								Stream.filter((event) => event.videoId === videoId),
							);
						}),
					),

				subscribeAll: () =>
					Stream.unwrapScoped(
						Effect.gen(function* () {
							const dequeue = yield* PubSub.subscribe(pubsub);
							return Stream.fromQueue(dequeue);
						}),
					),
			} satisfies ProgressService;
		}),
	);

	return {
		layer,
		getEvents: Effect.sync(() => [...collectedEvents]),
	};
}

/**
 * Factory function for creating a mock progress service with custom implementations.
 *
 * @example
 * ```typescript
 * const testLayer = makeProgressMockLayer({
 *   emit: (event) => {
 *     console.log("Mock emit:", event)
 *     return Effect.void
 *   },
 * })
 * ```
 */
export function makeProgressMockLayer(
	overrides: Partial<{
		emit: (event: ProgressEvent) => Effect.Effect<void>;
		subscribe: (videoId: number) => Stream.Stream<ProgressEvent>;
		subscribeAll: () => Stream.Stream<ProgressEvent>;
	}>,
): Layer.Layer<Progress> {
	return Layer.succeed(Progress, {
		emit: overrides.emit ?? (() => Effect.void),
		subscribe: overrides.subscribe ?? (() => Stream.empty),
		subscribeAll: overrides.subscribeAll ?? (() => Stream.empty),
	} satisfies ProgressService);
}
