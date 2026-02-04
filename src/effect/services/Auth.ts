/**
 * Auth Effect Service
 *
 * Provides authentication and session management functionality.
 * This is a dependent service that requires the Database service.
 *
 * The service handles:
 * - Session validation with token lookup
 * - Session creation with secure token generation
 * - Session deletion (logout)
 * - User sessions deletion (logout everywhere)
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const auth = yield* Auth
 *   const session = yield* auth.validateSession("token123")
 *   return session.user
 * })
 *
 * // Run with live database
 * await Effect.runPromise(program.pipe(
 *   Effect.provide(Auth.Live),
 *   Effect.provide(Database.Live)
 * ))
 * ```
 */

import { Context, Effect, Layer } from "effect";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { sessions, users } from "../../db/schema";
import { UnauthorizedError } from "../errors";
import { Database } from "./Database";
import type { AuthService, AuthUser, SessionWithUser } from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Session duration: 30 days in milliseconds */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generates a cryptographically secure session token.
 * Returns a 64-character hex string (32 random bytes).
 */
function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Auth service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const auth = yield* Auth
 * const session = yield* auth.validateSession(token)
 * ```
 */
export class Auth extends Context.Tag("@ytscribe/Auth")<Auth, AuthService>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that connects to the Database service.
	 *
	 * - Validates sessions against the database
	 * - Checks for expired sessions
	 * - Excludes soft-deleted users
	 */
	static readonly Live = Layer.effect(
		Auth,
		Effect.gen(function* () {
			const { db } = yield* Database;

			const validateSession = (
				token: string,
			): Effect.Effect<SessionWithUser, UnauthorizedError> =>
				Effect.gen(function* () {
					const now = new Date();

					const result = db
						.select({
							token: sessions.token,
							expiresAt: sessions.expiresAt,
							user: {
								id: users.id,
								email: users.email,
								name: users.name,
								avatarUrl: users.avatarUrl,
							},
						})
						.from(sessions)
						.innerJoin(users, eq(sessions.userId, users.id))
						.where(
							and(
								eq(sessions.token, token),
								gt(sessions.expiresAt, now),
								isNull(users.deletedAt),
							),
						)
						.get();

					if (!result) {
						return yield* Effect.fail(new UnauthorizedError());
					}

					return {
						token: result.token,
						expiresAt: result.expiresAt,
						user: result.user as AuthUser,
					} satisfies SessionWithUser;
				});

			const createSession = (
				userId: number,
			): Effect.Effect<{ token: string; expiresAt: Date }> =>
				Effect.sync(() => {
					const token = generateToken();
					const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

					db.insert(sessions)
						.values({
							userId,
							token,
							expiresAt,
						})
						.run();

					return { token, expiresAt };
				});

			const deleteSession = (token: string): Effect.Effect<void> =>
				Effect.sync(() => {
					db.delete(sessions).where(eq(sessions.token, token)).run();
				});

			const deleteUserSessions = (userId: number): Effect.Effect<void> =>
				Effect.sync(() => {
					db.delete(sessions).where(eq(sessions.userId, userId)).run();
				});

			const deleteExpiredSessions = (): Effect.Effect<void> =>
				Effect.sync(() => {
					const now = new Date();
					db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
				});

			return {
				validateSession,
				createSession,
				deleteSession,
				deleteUserSessions,
				deleteExpiredSessions,
			} satisfies AuthService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer with mock implementations that fail with helpful messages.
	 *
	 * Use makeAuthTestLayer() to provide custom mock implementations.
	 */
	static readonly Test = Layer.succeed(
		Auth,
		{
			validateSession: () =>
				Effect.die(
					new Error(
						"Auth.Test: validateSession not implemented. Use makeAuthTestLayer() to provide a mock.",
					),
				),
			createSession: () =>
				Effect.die(
					new Error(
						"Auth.Test: createSession not implemented. Use makeAuthTestLayer() to provide a mock.",
					),
				),
			deleteSession: () =>
				Effect.die(
					new Error(
						"Auth.Test: deleteSession not implemented. Use makeAuthTestLayer() to provide a mock.",
					),
				),
			deleteUserSessions: () =>
				Effect.die(
					new Error(
						"Auth.Test: deleteUserSessions not implemented. Use makeAuthTestLayer() to provide a mock.",
					),
				),
			deleteExpiredSessions: () =>
				Effect.die(
					new Error(
						"Auth.Test: deleteExpiredSessions not implemented. Use makeAuthTestLayer() to provide a mock.",
					),
				),
		} satisfies AuthService,
	);
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom mock implementations.
 *
 * @example
 * ```typescript
 * const testLayer = makeAuthTestLayer({
 *   validateSession: (token) =>
 *     token === "valid"
 *       ? Effect.succeed({ token, expiresAt: new Date(), user: mockUser })
 *       : Effect.fail(new UnauthorizedError()),
 * })
 * ```
 */
export function makeAuthTestLayer(
	mocks: Partial<AuthService>,
): Layer.Layer<Auth> {
	const defaultService: AuthService = {
		validateSession: () =>
			Effect.die(
				new Error(
					"Auth mock: validateSession not implemented. Provide a mock implementation.",
				),
			),
		createSession: () =>
			Effect.die(
				new Error(
					"Auth mock: createSession not implemented. Provide a mock implementation.",
				),
			),
		deleteSession: () =>
			Effect.die(
				new Error(
					"Auth mock: deleteSession not implemented. Provide a mock implementation.",
				),
			),
		deleteUserSessions: () =>
			Effect.die(
				new Error(
					"Auth mock: deleteUserSessions not implemented. Provide a mock implementation.",
				),
			),
		deleteExpiredSessions: () =>
			Effect.die(
				new Error(
					"Auth mock: deleteExpiredSessions not implemented. Provide a mock implementation.",
				),
			),
	};

	return Layer.succeed(Auth, {
		...defaultService,
		...mocks,
	});
}

/**
 * Re-export the token generation function for use in tests.
 * This allows tests to generate tokens that match the production format.
 */
export { generateToken as _generateTokenForTest };
