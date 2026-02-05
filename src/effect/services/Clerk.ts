/**
 * Clerk Effect Service
 *
 * Wraps @clerk/backend SDK in Effect-TS service pattern for JWT verification.
 * Clerk handles all OAuth flows, sessions, and user management externally -
 * this service only verifies incoming JWTs and retrieves user data.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const clerk = yield* Clerk
 *   const payload = yield* clerk.verifyToken("eyJ...")
 *   return payload.sub // Clerk user ID
 * })
 * ```
 */

import { Context, Effect, Layer, Config } from "effect";
import { createClerkClient, verifyToken as clerkVerifyToken } from "@clerk/backend";
import { UnauthorizedError } from "../errors";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Verified JWT payload from Clerk.
 * Contains the Clerk user ID and session metadata.
 */
export interface ClerkJwtPayload {
	/** Clerk user ID (e.g., "user_2abc123...") */
	sub: string;
	/** Session ID */
	sid: string;
	/** Issued at timestamp */
	iat: number;
	/** Expiration timestamp */
	exp: number;
	/** Authorized party (your frontend URL) */
	azp?: string;
}

/**
 * Clerk user data retrieved from the API.
 */
export interface ClerkUser {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	imageUrl: string | null;
}

/**
 * Clerk service interface.
 */
export interface ClerkService {
	/**
	 * Verifies a Clerk JWT and returns the payload.
	 * Returns UnauthorizedError if the token is invalid or expired.
	 */
	readonly verifyToken: (
		token: string,
	) => Effect.Effect<ClerkJwtPayload, UnauthorizedError>;

	/**
	 * Retrieves a user from Clerk by their Clerk user ID.
	 */
	readonly getUser: (
		clerkUserId: string,
	) => Effect.Effect<ClerkUser, UnauthorizedError>;
}

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Clerk service Context.Tag for dependency injection.
 */
export class Clerk extends Context.Tag("@ytscribe/Clerk")<Clerk, ClerkService>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that connects to Clerk's API.
	 * Requires CLERK_SECRET_KEY environment variable.
	 */
	static readonly Live = Layer.effect(
		Clerk,
		Effect.gen(function* () {
			const secretKey = yield* Config.string("CLERK_SECRET_KEY");

			const client = createClerkClient({ secretKey });

			const verifyToken = (
				token: string,
			): Effect.Effect<ClerkJwtPayload, UnauthorizedError> =>
				Effect.tryPromise({
					try: async () => {
						const payload = await clerkVerifyToken(token, { secretKey });
						return payload as ClerkJwtPayload;
					},
					catch: () => new UnauthorizedError(),
				});

			const getUser = (
				clerkUserId: string,
			): Effect.Effect<ClerkUser, UnauthorizedError> =>
				Effect.tryPromise({
					try: async () => {
						const user = await client.users.getUser(clerkUserId);
						const primaryEmail = user.emailAddresses.find(
							(e) => e.id === user.primaryEmailAddressId,
						);

						return {
							id: user.id,
							email: primaryEmail?.emailAddress ?? "",
							firstName: user.firstName,
							lastName: user.lastName,
							imageUrl: user.imageUrl,
						} satisfies ClerkUser;
					},
					catch: () => new UnauthorizedError(),
				});

			return { verifyToken, getUser } satisfies ClerkService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer with mock implementations.
	 */
	static readonly Test = Layer.succeed(Clerk, {
		verifyToken: () =>
			Effect.die(
				new Error(
					"Clerk.Test: verifyToken not implemented. Use makeClerkTestLayer().",
				),
			),
		getUser: () =>
			Effect.die(
				new Error(
					"Clerk.Test: getUser not implemented. Use makeClerkTestLayer().",
				),
			),
	} satisfies ClerkService);
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory for creating test layers with custom mock implementations.
 */
export function makeClerkTestLayer(
	mocks: Partial<ClerkService>,
): Layer.Layer<Clerk> {
	const defaultService: ClerkService = {
		verifyToken: () =>
			Effect.die(new Error("Clerk mock: verifyToken not implemented.")),
		getUser: () =>
			Effect.die(new Error("Clerk mock: getUser not implemented.")),
	};

	return Layer.succeed(Clerk, { ...defaultService, ...mocks });
}
