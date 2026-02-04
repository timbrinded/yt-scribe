/**
 * Effect-TS HttpApiGroup for Auth Endpoints
 *
 * Defines authentication endpoints:
 * - GET /auth/google - Redirect to Google OAuth consent screen
 * - GET /auth/google/callback - Handle OAuth callback
 * - POST /auth/logout - Clear session and log out
 * - GET /auth/me - Get current authenticated user
 *
 * Note: The OAuth endpoints (google, google/callback) handle their own responses
 * (redirects) and don't follow standard JSON response patterns.
 */

import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { BadRequestError, UnauthorizedError } from "../../errors";
import { Authorization } from "../middleware/auth";

// =============================================================================
// REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Query parameters for initiating Google OAuth.
 */
export const GoogleAuthParams = Schema.Struct({
	cli_callback: Schema.optionalWith(
		Schema.String.pipe(
			Schema.annotations({
				description: "Optional callback URL for CLI authentication flow",
			}),
		),
		{ as: "Option" },
	),
});

/**
 * Query parameters from Google OAuth callback.
 */
export const GoogleCallbackParams = Schema.Struct({
	code: Schema.optionalWith(
		Schema.String.pipe(
			Schema.annotations({ description: "Authorization code from Google" }),
		),
		{ as: "Option" },
	),
	state: Schema.optionalWith(
		Schema.String.pipe(
			Schema.annotations({ description: "State parameter for CSRF protection" }),
		),
		{ as: "Option" },
	),
	error: Schema.optionalWith(
		Schema.String.pipe(
			Schema.annotations({ description: "Error code if authorization failed" }),
		),
		{ as: "Option" },
	),
});

/**
 * Response schema for redirect (used for documentation).
 * The actual response is a 302 redirect, not JSON.
 */
export class RedirectResponse extends Schema.Class<RedirectResponse>(
	"RedirectResponse",
)({
	message: Schema.String.pipe(
		Schema.annotations({ description: "Redirect message" }),
	),
}) {}

/**
 * Response for successful logout.
 */
export class LogoutResponse extends Schema.Class<LogoutResponse>(
	"LogoutResponse",
)({
	success: Schema.Boolean.pipe(
		Schema.annotations({ description: "Whether logout was successful" }),
	),
}) {}

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
 * GET /auth/google - Initiate Google OAuth flow.
 *
 * Redirects the user to Google's OAuth consent screen.
 * Stores state and code verifier in secure cookies for PKCE flow.
 *
 * Note: Returns 302 redirect, not JSON. Success schema is for documentation.
 */
const googleAuth = HttpApiEndpoint.get("googleAuth", "/auth/google")
	.setUrlParams(GoogleAuthParams)
	.addSuccess(RedirectResponse, { status: 302 })
	.annotate(OpenApi.Summary, "Initiate Google OAuth")
	.annotate(
		OpenApi.Description,
		"Redirects to Google OAuth consent screen. Pass cli_callback query param for CLI authentication flow.",
	);

/**
 * GET /auth/google/callback - Handle Google OAuth callback.
 *
 * Exchanges authorization code for tokens, creates/updates user,
 * creates session, and redirects to app.
 *
 * Note: Returns 302 redirect, not JSON. Success schema is for documentation.
 */
const googleCallback = HttpApiEndpoint.get(
	"googleCallback",
	"/auth/google/callback",
)
	.setUrlParams(GoogleCallbackParams)
	.addSuccess(RedirectResponse, { status: 302 })
	.addError(BadRequestError)
	.annotate(OpenApi.Summary, "Google OAuth callback")
	.annotate(
		OpenApi.Description,
		"Handles the OAuth callback from Google. Validates state, exchanges code for tokens, creates session, and redirects user.",
	);

/**
 * POST /auth/logout - Log out and clear session.
 *
 * Requires authentication. Deletes the current session from the database
 * and clears the session cookie.
 */
const logout = HttpApiEndpoint.post("logout", "/auth/logout")
	.addSuccess(LogoutResponse)
	.middleware(Authorization)
	.annotate(OpenApi.Summary, "Log out")
	.annotate(
		OpenApi.Description,
		"Logs out the current user by deleting the session. Requires authentication.",
	);

/**
 * GET /auth/me - Get current authenticated user.
 *
 * Returns the currently authenticated user's information.
 * Requires authentication.
 */
const currentUser = HttpApiEndpoint.get("currentUser", "/auth/me")
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
 * OAuth endpoints (google, google/callback) are public.
 * logout and currentUser require authentication.
 *
 * Note: Authorization middleware is applied per-endpoint, not to the group,
 * because OAuth endpoints must be accessible without authentication.
 */
export const AuthGroup = HttpApiGroup.make("auth")
	.add(googleAuth)
	.add(googleCallback)
	.add(logout)
	.add(currentUser)
	.prefix("/auth")
	.annotate(OpenApi.Title, "Authentication")
	.annotate(OpenApi.Description, "Google OAuth authentication endpoints");
