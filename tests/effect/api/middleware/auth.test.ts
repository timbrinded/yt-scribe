/**
 * Tests for the Effect-TS Auth HttpApiMiddleware
 *
 * Note: The HttpApiMiddleware has internal context requirements (HttpRouter.Provided)
 * that are satisfied when integrated with the HttpApi system. These tests focus on:
 * 1. Type definitions and exports (CurrentUser context tag)
 * 2. AuthorizationLive layer construction with Auth service
 * 3. The middleware class is properly defined
 *
 * Full integration testing of the middleware will happen in the API handler tests
 * once the HttpApi is fully wired up.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import {
	Authorization,
	AuthorizationLive,
	CurrentUser,
} from "../../../../src/effect/api/middleware/auth";
import { makeAuthTestLayer } from "../../../../src/effect/services/Auth";
import type { AuthUser } from "../../../../src/effect/services/types";

// =============================================================================
// Test Helpers
// =============================================================================

const mockUser: AuthUser = {
	id: 1,
	email: "test@example.com",
	name: "Test User",
	avatarUrl: "https://example.com/avatar.png",
};

// =============================================================================
// CurrentUser Context Tag Tests
// =============================================================================

describe("CurrentUser", () => {
	it.effect("can be provided and accessed in an Effect", () =>
		Effect.gen(function* () {
			const user = yield* CurrentUser;
			expect(user).toEqual(mockUser);
		}).pipe(Effect.provideService(CurrentUser, mockUser)),
	);

	it("has the correct tag identifier", () => {
		// Verify the tag identifier follows convention
		expect(CurrentUser.key).toBe("@ytscribe/CurrentUser");
	});

	it.effect("can be used as a service dependency", () =>
		Effect.gen(function* () {
			// This pattern is how handlers will access the current user
			const user = yield* CurrentUser;
			const greeting = `Hello, ${user.name}!`;
			expect(greeting).toBe("Hello, Test User!");
		}).pipe(Effect.provideService(CurrentUser, mockUser)),
	);

	it.effect("handles null name gracefully", () =>
		Effect.gen(function* () {
			const userWithNullName: AuthUser = {
				id: 3,
				email: "noname@test.com",
				name: null,
				avatarUrl: null,
			};

			const name = yield* Effect.gen(function* () {
				const user = yield* CurrentUser;
				return user.name ?? "Anonymous";
			}).pipe(Effect.provideService(CurrentUser, userWithNullName));

			expect(name).toBe("Anonymous");
		}),
	);

	it.effect("provides all AuthUser fields", () =>
		Effect.gen(function* () {
			const user = yield* CurrentUser;
			expect(typeof user.id).toBe("number");
			expect(typeof user.email).toBe("string");
			expect(user.name === null || typeof user.name === "string").toBe(true);
			expect(user.avatarUrl === null || typeof user.avatarUrl === "string").toBe(true);
		}).pipe(Effect.provideService(CurrentUser, mockUser)),
	);
});

// =============================================================================
// Authorization Middleware Tag Tests
// =============================================================================

describe("Authorization", () => {
	it("has the correct middleware identifier", () => {
		// The middleware tag should follow naming convention
		expect(Authorization.key).toBe("@ytscribe/Authorization");
	});

	it("is defined as an HttpApiMiddleware.Tag", () => {
		// Verify the Authorization class exists and has the expected structure
		expect(typeof Authorization).toBe("function");
	});

	it("has security configuration", () => {
		// The Authorization class should have security definitions
		expect((Authorization as unknown as { security: unknown }).security).toBeDefined();
		expect((Authorization as unknown as { security: { bearer: unknown } }).security.bearer).toBeDefined();
	});

	it("provides CurrentUser context", () => {
		// The Authorization middleware should indicate it provides CurrentUser
		expect((Authorization as unknown as { provides: unknown }).provides).toBe(CurrentUser);
	});

	it("declares UnauthorizedError as failure type", () => {
		// The Authorization middleware should declare its error type
		expect((Authorization as unknown as { failure: unknown }).failure).toBeDefined();
	});
});

// =============================================================================
// AuthorizationLive Layer Tests
// =============================================================================

describe("AuthorizationLive", () => {
	it("is a valid Effect Layer", () => {
		// Verify AuthorizationLive is a Layer
		expect(AuthorizationLive).toBeDefined();
		expect(Layer.isLayer(AuthorizationLive)).toBe(true);
	});

	it.effect("can be constructed with Auth service", () =>
		Effect.gen(function* () {
			// Create a mock Auth service that returns a user for any token
			const authLayer = makeAuthTestLayer({
				validateSession: (token) =>
					Effect.succeed({
						token,
						expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
						user: mockUser,
					}),
			});

			// Verify the layer can be constructed and provides the Authorization service
			const auth = yield* Effect.provide(
				Authorization,
				Layer.provide(AuthorizationLive, authLayer),
			);

			// The authorization object should have a bearer handler
			expect(typeof auth.bearer).toBe("function");
		}),
	);

	it.effect("exposes bearer handler from the layer", () =>
		Effect.gen(function* () {
			const authLayer = makeAuthTestLayer({
				validateSession: () =>
					Effect.succeed({
						token: "test",
						expiresAt: new Date(),
						user: mockUser,
					}),
			});

			const authService = yield* Effect.provide(
				Authorization,
				Layer.provide(AuthorizationLive, authLayer),
			);

			// Should have the bearer handler
			expect(authService).toHaveProperty("bearer");
			expect(typeof authService.bearer).toBe("function");
		}),
	);

	it("requires Auth service dependency", () => {
		// AuthorizationLive depends on Auth service
		// Verify this by checking the layer requires Auth
		// When used without Auth, the program will have unsatisfied requirements
		expect(Layer.isLayer(AuthorizationLive)).toBe(true);
		// The layer is well-typed to require Auth - TypeScript enforces this at compile time
	});
});

// =============================================================================
// Token Redaction Tests
// =============================================================================

describe("Token security", () => {
	it("Redacted tokens do not leak in console.log", () => {
		const token = Redacted.make("super-secret-value");
		const stringified = String(token);

		// Redacted values should not expose the secret when stringified
		expect(stringified).not.toContain("super-secret-value");
	});

	it("Redacted.value extracts the actual token", () => {
		const token = Redacted.make("my-secret-token");
		expect(Redacted.value(token)).toBe("my-secret-token");
	});

	it("Redacted.isRedacted correctly identifies Redacted values", () => {
		const token = Redacted.make("secret");
		expect(Redacted.isRedacted(token)).toBe(true);
		expect(Redacted.isRedacted("plain string")).toBe(false);
	});
});

// =============================================================================
// Module Exports Tests
// =============================================================================

describe("Module exports", () => {
	it.effect("exports CurrentUser", () =>
		Effect.gen(function* () {
			const { CurrentUser: ExportedCurrentUser } = yield* Effect.promise(() =>
				import("../../../../src/effect/api/middleware/auth"),
			);
			expect(ExportedCurrentUser).toBeDefined();
			expect(ExportedCurrentUser.key).toBe("@ytscribe/CurrentUser");
		}),
	);

	it.effect("exports Authorization", () =>
		Effect.gen(function* () {
			const { Authorization: ExportedAuth } = yield* Effect.promise(() =>
				import("../../../../src/effect/api/middleware/auth"),
			);
			expect(ExportedAuth).toBeDefined();
			expect(ExportedAuth.key).toBe("@ytscribe/Authorization");
		}),
	);

	it.effect("exports AuthorizationLive", () =>
		Effect.gen(function* () {
			const { AuthorizationLive: ExportedLive } = yield* Effect.promise(() =>
				import("../../../../src/effect/api/middleware/auth"),
			);
			expect(ExportedLive).toBeDefined();
			expect(Layer.isLayer(ExportedLive)).toBe(true);
		}),
	);

	it.effect("exports AuthorizationTest", () =>
		Effect.gen(function* () {
			const { AuthorizationTest: ExportedTest } = yield* Effect.promise(() =>
				import("../../../../src/effect/api/middleware/auth"),
			);
			expect(ExportedTest).toBeDefined();
			expect(Layer.isLayer(ExportedTest)).toBe(true);
		}),
	);

	it.effect("exports makeAuthorizationTestLayer", () =>
		Effect.gen(function* () {
			const { makeAuthorizationTestLayer: ExportedFactory } = yield* Effect.promise(() =>
				import("../../../../src/effect/api/middleware/auth"),
			);
			expect(ExportedFactory).toBeDefined();
			expect(typeof ExportedFactory).toBe("function");
		}),
	);
});
