/**
 * Effect-TS Admin Endpoint Handlers
 *
 * Implements the admin API endpoints using HttpApiBuilder.group pattern.
 * Each handler accesses the authenticated user via CurrentUser context.
 *
 * Endpoints:
 * - getAnalytics: GET /api/admin/analytics - List analytics events
 *
 * @example
 * ```typescript
 * const AdminGroupLive = HttpApiBuilder.group(YTScribeApi, "admin", (handlers) =>
 *   handlers.handle("getAnalytics", getAnalyticsHandler)
 * )
 * ```
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect, Option } from "effect";
import { YTScribeApi } from "../index";
import { Analytics } from "../../services/Analytics";
import type {
	AnalyticsListResponse,
	AnalyticsEventResponse,
} from "../groups/admin";
import type { AnalyticsEventType } from "../../services/types";

// =============================================================================
// HANDLER: getAnalytics
// =============================================================================

/**
 * GET /api/admin/analytics - Get analytics events.
 *
 * Returns paginated list of analytics events with optional filtering.
 */
const getAnalyticsHandler = ({
	urlParams,
}: {
	urlParams: {
		limit: Option.Option<number>;
		offset: Option.Option<number>;
		userId: Option.Option<number>;
		event: Option.Option<
			"video_added" | "transcription_completed" | "chat_message_sent"
		>;
	};
}) =>
	Effect.gen(function* () {
		const analyticsService = yield* Analytics;

		// Extract optional query params
		const limit = Option.getOrUndefined(urlParams.limit);
		const offset = Option.getOrUndefined(urlParams.offset);
		const userId = Option.getOrUndefined(urlParams.userId);
		const event = Option.getOrUndefined(urlParams.event) as
			| AnalyticsEventType
			| undefined;

		// Get events from analytics service
		const result = yield* analyticsService.getEvents({
			limit,
			offset,
			userId,
			event,
		});

		// Map to response format
		const events: (typeof AnalyticsEventResponse.Type)[] = result.items.map(
			(item) => ({
				id: item.id,
				userId: item.userId,
				event: item.event,
				properties: item.properties,
				createdAt: item.createdAt.toISOString(),
			}),
		);

		return {
			events,
			total: result.total,
			limit: result.limit,
			offset: result.offset,
		} satisfies typeof AnalyticsListResponse.Type;
	});

// =============================================================================
// GROUP LAYER
// =============================================================================

/**
 * Live layer providing admin endpoint handlers.
 *
 * Dependencies:
 * - CurrentUser: Provided by Authorization middleware
 * - Analytics: For event retrieval
 */
export const AdminGroupLive = HttpApiBuilder.group(
	YTScribeApi,
	"admin",
	(handlers) => handlers.handle("getAnalytics", getAnalyticsHandler),
);
