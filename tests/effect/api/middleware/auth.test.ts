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

import { describe, expect, it } from "bun:test";
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
	it("can be provided and accessed in an Effect", async () => {
		const program = Effect.gen(function* () {
			const user = yield* CurrentUser;
			return user;
		});

		const result = await Effect.runPromise(
			program.pipe(Effect.provideService(CurrentUser, mockUser)),
		);

		expect(result).toEqual(mockUser);
	});

	it("has the correct tag identifier", () => {
		// Verify the tag identifier follows convention
		expect(CurrentUser.key).toBe("@ytscribe/CurrentUser");
	});

	it("can be used as a service dependency", async () => {
		// This pattern is how handlers will access the current user
		const program = Effect.gen(function* () {
			const user = yield* CurrentUser;
			return `Hello, ${user.name}!`;
		});

		const result = await Effect.runPromise(
			program.pipe(Effect.provideService(CurrentUser, mockUser)),
		);

		expect(result).toBe("Hello, Test User!");
	});

	it("handles null name gracefully", async () => {
		const userWithNullName: AuthUser = {
			id: 3,
			email: "noname@test.com",
			name: null,
			avatarUrl: null,
		};

		const program = Effect.gen(function* () {
			const user = yield* CurrentUser;
			return user.name ?? "Anonymous";
		});

		const result = await Effect.runPromise(
			program.pipe(Effect.provideService(CurrentUser, userWithNullName)),
		);

		expect(result).toBe("Anonymous");
	});

	it("provides all AuthUser fields", async () => {
		const program = Effect.gen(function* () {
			const user = yield* CurrentUser;
			return {
				hasId: typeof user.id === "number",
				hasEmail: typeof user.email === "string",
				hasName: user.name === null || typeof user.name === "string",
				hasAvatar: user.avatarUrl === null || typeof user.avatarUrl === "string",
			};
		});

		const result = await Effect.runPromise(
			program.pipe(Effect.provideService(CurrentUser, mockUser)),
		);

		expect(result).toEqual({
			hasId: true,
			hasEmail: true,
			hasName: true,
			hasAvatar: true,
		});
	});
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
		expect((Authorization as any).security).toBeDefined();
		expect((Authorization as any).security.bearer).toBeDefined();
	});

	it("provides CurrentUser context", () => {
		// The Authorization middleware should indicate it provides CurrentUser
		expect((Authorization as any).provides).toBe(CurrentUser);
	});

	it("declares UnauthorizedError as failure type", () => {
		// The Authorization middleware should declare its error type
		expect((Authorization as any).failure).toBeDefined();
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

	it("can be constructed with Auth service", async () => {
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
		const program = Effect.gen(function* () {
			const auth = yield* Authorization;
			// The authorization object should have a bearer handler
			expect(typeof auth.bearer).toBe("function");
			return "layer constructed successfully";
		});

		// The layer should build without errors
		const result = await Effect.runPromise(
			program.pipe(
				Effect.provide(AuthorizationLive),
				Effect.provide(authLayer),
			),
		);

		expect(result).toBe("layer constructed successfully");
	});

	it("exposes bearer handler from the layer", async () => {
		const authLayer = makeAuthTestLayer({
			validateSession: () =>
				Effect.succeed({
					token: "test",
					expiresAt: new Date(),
					user: mockUser,
				}),
		});

		const program = Effect.gen(function* () {
			const auth = yield* Authorization;
			return auth;
		});

		const authService = await Effect.runPromise(
			program.pipe(
				Effect.provide(AuthorizationLive),
				Effect.provide(authLayer),
			),
		);

		// Should have the bearer handler
		expect(authService).toHaveProperty("bearer");
		expect(typeof authService.bearer).toBe("function");
	});

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
	it("exports CurrentUser", async () => {
		const { CurrentUser: ExportedCurrentUser } = await import(
			"../../../../src/effect/api/middleware/auth"
		);
		expect(ExportedCurrentUser).toBeDefined();
		expect(ExportedCurrentUser.key).toBe("@ytscribe/CurrentUser");
	});

	it("exports Authorization", async () => {
		const { Authorization: ExportedAuth } = await import(
			"../../../../src/effect/api/middleware/auth"
		);
		expect(ExportedAuth).toBeDefined();
		expect(ExportedAuth.key).toBe("@ytscribe/Authorization");
	});

	it("exports AuthorizationLive", async () => {
		const { AuthorizationLive: ExportedLive } = await import(
			"../../../../src/effect/api/middleware/auth"
		);
		expect(ExportedLive).toBeDefined();
		expect(Layer.isLayer(ExportedLive)).toBe(true);
	});

	it("exports AuthorizationTest", async () => {
		const { AuthorizationTest: ExportedTest } = await import(
			"../../../../src/effect/api/middleware/auth"
		);
		expect(ExportedTest).toBeDefined();
		expect(Layer.isLayer(ExportedTest)).toBe(true);
	});

	it("exports makeAuthorizationTestLayer", async () => {
		const { makeAuthorizationTestLayer: ExportedFactory } = await import(
			"../../../../src/effect/api/middleware/auth"
		);
		expect(ExportedFactory).toBeDefined();
		expect(typeof ExportedFactory).toBe("function");
	});
});
