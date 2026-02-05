/**
 * Effect-TS Auth HttpApiMiddleware (Clerk)
 *
 * Provides bearer token authentication middleware using Clerk JWTs.
 * Uses HttpApiMiddleware.Tag pattern with HttpApiSecurity.bearer for token validation.
 *
 * This middleware:
 * - Extracts bearer token from Authorization header
 * - Verifies JWT via Clerk service
 * - Looks up or creates user by clerkId in local database (JIT provisioning)
 * - Provides CurrentUser context to downstream handlers on success
 * - Returns UnauthorizedError (401) on invalid/missing tokens
 *
 * @example
 * ```typescript
 * // Apply to an endpoint
 * HttpApiEndpoint.get("getVideo", "/videos/:id")
 *   .middleware(Authorization)
 *
 * // Access the current user in handlers
 * Effect.gen(function* () {
 *   const user = yield* CurrentUser
 *   // user.id, user.email, etc.
 * })
 * ```
 */

import { HttpApiMiddleware, HttpApiSecurity, OpenApi } from "@effect/platform";
import { Context, Effect, Layer, Redacted } from "effect";
import { eq, isNull, and } from "drizzle-orm";
import { UnauthorizedError } from "../../errors";
import { Clerk } from "../../services/Clerk";
import { Database } from "../../services/Database";
import { users } from "../../../db/schema";
import type { AuthUser } from "../../services/types";

// =============================================================================
// CURRENT USER CONTEXT
// =============================================================================

/**
 * Context.Tag for the authenticated user.
 *
 * This is provided by the Authorization middleware after successful authentication.
 * Handlers can use `yield* CurrentUser` to access the authenticated user's info.
 */
export class CurrentUser extends Context.Tag("@ytscribe/CurrentUser")<
	CurrentUser,
	AuthUser
>() {}

// =============================================================================
// AUTHORIZATION MIDDLEWARE
// =============================================================================

/**
 * Authorization middleware using Clerk JWT authentication.
 *
 * Configuration:
 * - `failure: UnauthorizedError` - Returns 401 when auth fails
 * - `provides: CurrentUser` - Makes CurrentUser available to handlers
 * - `security.bearer` - Expects Authorization: Bearer <token> header
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
					"Clerk JWT from frontend authentication",
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
 * Uses Clerk for JWT verification and performs JIT (just-in-time) user
 * provisioning - if a valid Clerk user doesn't exist in our local DB,
 * they're created automatically on first request.
 */
export const AuthorizationLive = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		const clerk = yield* Clerk;
		const { db } = yield* Database;

		return {
			bearer: (bearerToken: Redacted.Redacted<string>) =>
				Effect.gen(function* () {
					const token = Redacted.value(bearerToken);

					// Verify the JWT with Clerk
					const payload = yield* clerk.verifyToken(token);
					const clerkUserId = payload.sub;

					// Look up user by clerkId in local database
					let user = db
						.select({
							id: users.id,
							email: users.email,
							name: users.name,
							avatarUrl: users.avatarUrl,
						})
						.from(users)
						.where(and(eq(users.clerkId, clerkUserId), isNull(users.deletedAt)))
						.get();

					// JIT user provisioning: if user doesn't exist locally, create them
					if (!user) {
						const clerkUser = yield* clerk.getUser(clerkUserId);

						// Check if user exists by email (migration from old auth)
						const existingByEmail = db
							.select()
							.from(users)
							.where(
								and(eq(users.email, clerkUser.email), isNull(users.deletedAt)),
							)
							.get();

						if (existingByEmail) {
							// Link existing user to Clerk ID
							db.update(users)
								.set({
									clerkId: clerkUserId,
									name:
										clerkUser.firstName && clerkUser.lastName
											? `${clerkUser.firstName} ${clerkUser.lastName}`
											: (clerkUser.firstName ?? existingByEmail.name),
									avatarUrl: clerkUser.imageUrl ?? existingByEmail.avatarUrl,
								})
								.where(eq(users.id, existingByEmail.id))
								.run();

							user = {
								id: existingByEmail.id,
								email: existingByEmail.email,
								name:
									clerkUser.firstName && clerkUser.lastName
										? `${clerkUser.firstName} ${clerkUser.lastName}`
										: (clerkUser.firstName ?? existingByEmail.name),
								avatarUrl: clerkUser.imageUrl ?? existingByEmail.avatarUrl,
							};
						} else {
							// Create new user
							const fullName =
								clerkUser.firstName && clerkUser.lastName
									? `${clerkUser.firstName} ${clerkUser.lastName}`
									: clerkUser.firstName;

							const newUser = db
								.insert(users)
								.values({
									clerkId: clerkUserId,
									email: clerkUser.email,
									name: fullName,
									avatarUrl: clerkUser.imageUrl,
								})
								.returning({
									id: users.id,
									email: users.email,
									name: users.name,
									avatarUrl: users.avatarUrl,
								})
								.get();

							user = newUser;
						}
					}

					return user as AuthUser;
				}),
		};
	}),
);

// =============================================================================
// TEST LAYER
// =============================================================================

/**
 * Test layer for the Authorization middleware.
 * Returns a fixed mock user for any token.
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
 * Factory for creating test layers with custom authorization behavior.
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
