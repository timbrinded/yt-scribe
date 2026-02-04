/**
 * Analytics Effect Service
 *
 * Provides event tracking for user activity monitoring.
 * This is a dependent service that requires the Database service.
 *
 * Tracked events:
 * - video_added: When a user adds a new video
 * - transcription_completed: When video transcription finishes successfully
 * - chat_message_sent: When a user sends a chat message
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const analytics = yield* Analytics
 *   yield* analytics.trackEvent(userId, "video_added", { videoId: 123 })
 * })
 *
 * // Run with dependencies
 * await Effect.runPromise(program.pipe(Effect.provide(Analytics.Live), Effect.provide(Database.Live)))
 * ```
 */

import { Context, Effect, Layer } from "effect";
import { eq, desc, and, count } from "drizzle-orm";
import { Database } from "./Database";
import type {
	AnalyticsService,
	AnalyticsEventType,
	AnalyticsProperties,
	AnalyticsRecord,
	Paginated,
	DrizzleDatabase,
} from "./types";
import { analytics } from "../../db/schema";

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Analytics service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const analyticsService = yield* Analytics
 * yield* analyticsService.trackEvent(userId, "video_added", { videoId: 1 })
 * ```
 */
export class Analytics extends Context.Tag("@ytscribe/Analytics")<
	Analytics,
	AnalyticsService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that tracks events to the database.
	 *
	 * Dependencies:
	 * - Database: For storing analytics events
	 *
	 * IMPORTANT: Do NOT call Layer.provide here.
	 * Layer composition happens in src/effect/layers/Live.ts.
	 */
	static readonly Live = Layer.effect(
		Analytics,
		Effect.gen(function* () {
			const { db } = yield* Database;

			return {
				trackEvent: (
					userId: number,
					event: AnalyticsEventType,
					properties?: AnalyticsProperties,
				) => trackEventImpl(db, userId, event, properties),

				getEvents: (options) => getEventsImpl(db, options),
			} satisfies AnalyticsService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer providing a no-op analytics service.
	 *
	 * Events are logged but not persisted.
	 * Use makeAnalyticsTestLayer() for specific mock implementations.
	 */
	static readonly Test = Layer.succeed(Analytics, {
		trackEvent: (
			_userId: number,
			event: AnalyticsEventType,
			_properties?: AnalyticsProperties,
		) =>
			Effect.logDebug(`[Analytics.Test] trackEvent: ${event}`).pipe(
				Effect.asVoid,
			),

		getEvents: () =>
			Effect.succeed({
				items: [],
				total: 0,
				limit: 20,
				offset: 0,
			} satisfies Paginated<AnalyticsRecord>),
	} satisfies AnalyticsService);
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Tracks an analytics event to the database.
 */
function trackEventImpl(
	db: DrizzleDatabase,
	userId: number,
	event: AnalyticsEventType,
	properties?: AnalyticsProperties,
): Effect.Effect<void> {
	return Effect.sync(() => {
		try {
			db.insert(analytics)
				.values({
					userId,
					event,
					properties: properties ?? null,
				})
				.run();
		} catch (error) {
			// Log but don't fail - analytics should never break main flows
			console.error(
				"[Analytics] Failed to track event:",
				error instanceof Error ? error.message : String(error),
			);
		}
	});
}

/**
 * Retrieves analytics events with optional filtering.
 */
function getEventsImpl(
	db: DrizzleDatabase,
	options?: {
		userId?: number;
		event?: AnalyticsEventType;
		limit?: number;
		offset?: number;
	},
): Effect.Effect<Paginated<AnalyticsRecord>> {
	return Effect.sync(() => {
		const limit = options?.limit ?? 20;
		const offset = options?.offset ?? 0;

		// Build where conditions
		const conditions = [];
		if (options?.userId !== undefined) {
			conditions.push(eq(analytics.userId, options.userId));
		}
		if (options?.event !== undefined) {
			conditions.push(eq(analytics.event, options.event));
		}

		const whereClause =
			conditions.length > 0
				? and(...conditions)
				: undefined;

		// Get total count
		const totalResult = db
			.select({ count: count() })
			.from(analytics)
			.where(whereClause)
			.get();
		const total = totalResult?.count ?? 0;

		// Get paginated events
		const events = db
			.select()
			.from(analytics)
			.where(whereClause)
			.orderBy(desc(analytics.createdAt))
			.limit(limit)
			.offset(offset)
			.all();

		const items: AnalyticsRecord[] = events.map((e) => ({
			id: e.id,
			userId: e.userId,
			event: e.event as AnalyticsEventType,
			properties: e.properties as AnalyticsProperties | null,
			createdAt: e.createdAt,
		}));

		return {
			items,
			total,
			limit,
			offset,
		} satisfies Paginated<AnalyticsRecord>;
	});
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom mock implementations.
 *
 * @example
 * ```typescript
 * const events: Array<{userId: number, event: string}> = []
 * const testLayer = makeAnalyticsTestLayer({
 *   trackEvent: (userId, event, props) => {
 *     events.push({ userId, event })
 *     return Effect.void
 *   },
 * })
 * ```
 */
export function makeAnalyticsTestLayer(
	implementation: Partial<AnalyticsService>,
): Layer.Layer<Analytics> {
	const defaultImplementation: AnalyticsService = {
		trackEvent: () => Effect.void,
		getEvents: () =>
			Effect.succeed({
				items: [],
				total: 0,
				limit: 20,
				offset: 0,
			}),
	};

	return Layer.succeed(Analytics, {
		...defaultImplementation,
		...implementation,
	} satisfies AnalyticsService);
}
