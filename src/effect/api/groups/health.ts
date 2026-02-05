/**
 * Effect-TS HttpApiGroup for Health Check Endpoint
 *
 * Provides a simple health check endpoint that doesn't require authentication.
 * Used by Playwright and other tools to verify the server is running.
 */

import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";

// =============================================================================
// RESPONSE SCHEMA
// =============================================================================

/**
 * Response for health check endpoint.
 */
export class HealthResponse extends Schema.Class<HealthResponse>(
	"HealthResponse",
)({
	status: Schema.Literal("ok"),
	timestamp: Schema.String.pipe(
		Schema.annotations({ description: "ISO timestamp" }),
	),
}) {}

// =============================================================================
// ENDPOINT DEFINITION
// =============================================================================

/**
 * GET /health - Health check endpoint.
 *
 * Returns 200 OK if the server is running.
 * No authentication required.
 */
const healthCheck = HttpApiEndpoint.get("healthCheck", "/")
	.addSuccess(HealthResponse)
	.annotate(OpenApi.Summary, "Health check")
	.annotate(OpenApi.Description, "Returns 200 OK if the server is running.");

// =============================================================================
// GROUP DEFINITION
// =============================================================================

/**
 * Health API group.
 *
 * No authentication required.
 */
export const HealthGroup = HttpApiGroup.make("health")
	.add(healthCheck)
	.prefix("/health")
	.annotate(OpenApi.Title, "Health")
	.annotate(OpenApi.Description, "Server health check endpoint");
