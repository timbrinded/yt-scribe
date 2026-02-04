/**
 * Effect-TS HttpApiGroup for Admin Endpoints
 *
 * Defines admin-only endpoints:
 * - GET /api/admin/analytics - Get analytics events (protected)
 *
 * All endpoints require authentication via the Authorization middleware.
 */

import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { Authorization } from "../middleware/auth";

// =============================================================================
// REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Query parameters for analytics endpoint.
 */
export const AnalyticsQueryParams = Schema.Struct({
	limit: Schema.optionalWith(
		Schema.NumberFromString.pipe(
			Schema.int(),
			Schema.between(1, 100),
			Schema.annotations({ description: "Maximum items per page (1-100, default 20)" }),
		),
		{ as: "Option" },
	),
	offset: Schema.optionalWith(
		Schema.NumberFromString.pipe(
			Schema.int(),
			Schema.nonNegative(),
			Schema.annotations({ description: "Number of items to skip (default 0)" }),
		),
		{ as: "Option" },
	),
	userId: Schema.optionalWith(
		Schema.NumberFromString.pipe(
			Schema.int(),
			Schema.positive(),
			Schema.annotations({ description: "Filter by user ID" }),
		),
		{ as: "Option" },
	),
	event: Schema.optionalWith(
		Schema.Literal("video_added", "transcription_completed", "chat_message_sent").pipe(
			Schema.annotations({ description: "Filter by event type" }),
		),
		{ as: "Option" },
	),
});

/**
 * Single analytics event in response.
 */
export class AnalyticsEventResponse extends Schema.Class<AnalyticsEventResponse>(
	"AnalyticsEventResponse",
)({
	id: Schema.Number.pipe(Schema.annotations({ description: "Event ID" })),
	userId: Schema.Number.pipe(Schema.annotations({ description: "User ID who triggered the event" })),
	event: Schema.Literal("video_added", "transcription_completed", "chat_message_sent").pipe(
		Schema.annotations({ description: "Event type" }),
	),
	properties: Schema.NullOr(Schema.Unknown).pipe(
		Schema.annotations({ description: "Event properties (JSON object)" }),
	),
	createdAt: Schema.String.pipe(Schema.annotations({ description: "ISO timestamp when event occurred" })),
}) {}

/**
 * Response for analytics list endpoint.
 */
export class AnalyticsListResponse extends Schema.Class<AnalyticsListResponse>(
	"AnalyticsListResponse",
)({
	events: Schema.Array(AnalyticsEventResponse),
	total: Schema.Number.pipe(Schema.annotations({ description: "Total number of events matching query" })),
	limit: Schema.Number.pipe(Schema.annotations({ description: "Maximum items per page" })),
	offset: Schema.Number.pipe(Schema.annotations({ description: "Items skipped" })),
}) {}

// =============================================================================
// ENDPOINT DEFINITIONS
// =============================================================================

/**
 * GET /api/admin/analytics - Get analytics events.
 *
 * Returns paginated list of analytics events with optional filtering.
 * Requires authentication.
 */
const getAnalytics = HttpApiEndpoint.get("getAnalytics", "/analytics")
	.setUrlParams(AnalyticsQueryParams)
	.addSuccess(AnalyticsListResponse)
	.annotate(OpenApi.Summary, "Get analytics events")
	.annotate(
		OpenApi.Description,
		"Returns paginated list of analytics events. Supports filtering by userId and event type. Requires authentication.",
	);

// =============================================================================
// GROUP DEFINITION
// =============================================================================

/**
 * Admin API group.
 *
 * All endpoints require authentication.
 * In a production app, you'd add additional role-based authorization here.
 */
export const AdminGroup = HttpApiGroup.make("admin")
	.add(getAnalytics)
	.middleware(Authorization)
	.prefix("/api/admin")
	.annotate(OpenApi.Title, "Admin")
	.annotate(OpenApi.Description, "Admin-only endpoints for analytics and monitoring");
