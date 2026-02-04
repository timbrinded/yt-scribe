/**
 * Effect-TS Auth HttpApiMiddleware
 *
 * Provides bearer token authentication middleware for the Effect HTTP API.
 * Uses HttpApiMiddleware.Tag pattern with HttpApiSecurity.bearer for token validation.
 *
 * This middleware:
 * - Extracts bearer token from Authorization header
 * - Validates token via the Auth service
 * - Provides CurrentUser context to downstream handlers on success
 * - Returns UnauthorizedError (401) on invalid/missing tokens
 *
 * @example
 * ```typescript
 * // Apply to an endpoint
 * HttpApiEndpoint.get("getVideo", "/videos/:id")
 *   .middleware(Authorization)
 *
 * // Apply to a group
 * HttpApiGroup.make("videos")
 *   .middleware(Authorization)
 *
 * // Access the current user in handlers
 * Effect.gen(function* () {
 *   const user = yield* CurrentUser
 *   // user.id, user.email, etc.
 * })
 * ```
 */

import {
	HttpApiMiddleware,
	HttpApiSecurity,
	OpenApi,
} from "@effect/platform";
import { Context, Effect, Layer, Redacted } from "effect";
import { UnauthorizedError } from "../../errors";
import { Auth } from "../../services/Auth";
import type { AuthUser } from "../../services/types";

// =============================================================================
// CURRENT USER CONTEXT
// =============================================================================

/**
 * Context.Tag for the authenticated user.
 *
 * This is provided by the Authorization middleware after successful authentication.
 * Handlers can use `yield* CurrentUser` to access the authenticated user's info.
 *
 * @example
 * ```typescript
 * const handler = Effect.gen(function* () {
 *   const user = yield* CurrentUser
 *   console.log(`Authenticated as ${user.email}`)
 *   return user
 * })
 * ```
 */
export class CurrentUser extends Context.Tag("@ytscribe/CurrentUser")<
	CurrentUser,
	AuthUser
>() {}

// =============================================================================
// AUTHORIZATION MIDDLEWARE
// =============================================================================

/**
 * Authorization middleware using bearer token authentication.
 *
 * Configuration:
 * - `failure: UnauthorizedError` - Returns 401 when auth fails
 * - `provides: CurrentUser` - Makes CurrentUser available to handlers
 * - `security.bearer` - Expects Authorization: Bearer <token> header
 *
 * The bearer token is expected to be a session token from the Auth service.
 * On successful validation, the user info is made available via CurrentUser.
 */
export class Authorization extends HttpApiMiddleware.Tag<Authorization>()(
	"@ytscribe/Authorization",
	{
		failure: UnauthorizedError,
		provides: CurrentUser,
		security: {
			bearer: HttpApiSecurity.bearer.pipe(
				HttpApiSecurity.annotate(
					OpenApi.Description,
					"Session token from /auth/google OAuth flow",
				),
			),
		},
	},
) {}

// =============================================================================
// LIVE LAYER
// =============================================================================

/**
 * Live implementation of the Authorization middleware.
 *
 * Depends on the Auth service for session validation.
 * The middleware extracts the bearer token, validates it via Auth.validateSession,
 * and provides the user to downstream handlers via CurrentUser.
 *
 * @example
 * ```typescript
 * // Provide to your HTTP server
 * const HttpLive = HttpApiBuilder.serve(api).pipe(
 *   Layer.provide(AuthorizationLive),
 *   Layer.provide(Auth.Live),
 *   Layer.provide(Database.Live),
 * )
 * ```
 */
export const AuthorizationLive = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		const auth = yield* Auth;

		return {
			bearer: (bearerToken: Redacted.Redacted<string>) =>
				Effect.gen(function* () {
					// Extract the token value from the Redacted wrapper
					const token = Redacted.value(bearerToken);

					// Validate the session and get the user
					const session = yield* auth.validateSession(token);

					// Return the authenticated user (satisfies CurrentUser context)
					return session.user;
				}),
		};
	}),
);

// =============================================================================
// TEST LAYER
// =============================================================================

/**
 * Test layer for the Authorization middleware.
 *
 * Returns a fixed mock user for any token. Use makeAuthorizationTestLayer()
 * for custom behavior.
 */
export const AuthorizationTest = Layer.succeed(Authorization, {
	bearer: () =>
		Effect.succeed({
			id: 1,
			email: "test@example.com",
			name: "Test User",
			avatarUrl: null,
		} satisfies AuthUser),
});

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom authorization behavior.
 *
 * @example
 * ```typescript
 * // Mock specific user
 * const testLayer = makeAuthorizationTestLayer({
 *   bearer: () => Effect.succeed({ id: 42, email: "admin@test.com", name: "Admin", avatarUrl: null }),
 * })
 *
 * // Mock authorization failure
 * const failLayer = makeAuthorizationTestLayer({
 *   bearer: () => Effect.fail(new UnauthorizedError()),
 * })
 * ```
 */
export function makeAuthorizationTestLayer(mocks: {
	bearer?: (
		token: Redacted.Redacted<string>,
	) => Effect.Effect<AuthUser, UnauthorizedError>;
}): Layer.Layer<Authorization> {
	const defaultService = {
		bearer: () =>
			Effect.succeed({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				avatarUrl: null,
			} satisfies AuthUser),
	};

	return Layer.succeed(Authorization, {
		...defaultService,
		...mocks,
	});
}
