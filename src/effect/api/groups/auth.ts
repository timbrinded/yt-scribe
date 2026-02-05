/**
 * Effect-TS HttpApiGroup for Auth Endpoints (Clerk)
 *
 * With Clerk handling OAuth externally, this group is simplified to
 * just the current user endpoint.
 *
 * Endpoints:
 * - GET /auth/me - Get current authenticated user
 */

import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { UnauthorizedError } from "../../errors";
import { Authorization } from "../middleware/auth";

// =============================================================================
// RESPONSE SCHEMAS
// =============================================================================

/**
 * Response for current user endpoint.
 */
export class CurrentUserResponse extends Schema.Class<CurrentUserResponse>(
	"CurrentUserResponse",
)({
	id: Schema.Number.pipe(Schema.annotations({ description: "User ID" })),
	email: Schema.String.pipe(Schema.annotations({ description: "User email" })),
	name: Schema.NullOr(Schema.String).pipe(
		Schema.annotations({ description: "User display name" }),
	),
	avatarUrl: Schema.NullOr(Schema.String).pipe(
		Schema.annotations({ description: "URL to user's avatar image" }),
	),
}) {}

// =============================================================================
// ENDPOINT DEFINITIONS
// =============================================================================

/**
 * GET /auth/me - Get current authenticated user.
 *
 * Returns the currently authenticated user's information.
 * Requires Clerk JWT in Authorization header.
 */
const currentUser = HttpApiEndpoint.get("currentUser", "/me")
	.addSuccess(CurrentUserResponse)
	.addError(UnauthorizedError)
	.middleware(Authorization)
	.annotate(OpenApi.Summary, "Get current user")
	.annotate(
		OpenApi.Description,
		"Returns information about the currently authenticated user.",
	);

// =============================================================================
// GROUP DEFINITION
// =============================================================================

/**
 * Auth API group.
 *
 * With Clerk handling OAuth flows externally, this group only contains
 * the /auth/me endpoint for retrieving the current user.
 */
export const AuthGroup = HttpApiGroup.make("auth")
	.add(currentUser)
	.prefix("/auth")
	.annotate(OpenApi.Title, "Authentication")
	.annotate(OpenApi.Description, "User authentication endpoints");
