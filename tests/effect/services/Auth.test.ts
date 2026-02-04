/**
 * Tests for the Effect-TS Auth service.
 */

import { describe, expect, test } from "bun:test";
import { Effect, Exit, Layer } from "effect";
import { Auth, makeAuthTestLayer, _generateTokenForTest } from "../../../src/effect/services/Auth";
import { Database, makeDatabaseTestLayer } from "../../../src/effect/services/Database";
import { UnauthorizedError } from "../../../src/effect/errors";
import * as schema from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../src/effect/services/types";

// Helper to create a test layer with Auth.Live provided with Database
function createAuthLiveWithDb(
	setup?: (db: DrizzleDatabase) => void,
) {
	const dbLayer = makeDatabaseTestLayer(setup);
	// Merge the layers so both Auth and Database are available
	return Layer.merge(Layer.provide(Auth.Live, dbLayer), dbLayer);
}

describe("Auth Effect Service", () => {
	describe("Auth.Test layer", () => {
		test("throws helpful error for validateSession", async () => {
			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("any-token");
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Auth.Test)),
			);

			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				const causeString = String(result.cause);
				expect(causeString).toContain("Auth.Test: validateSession not implemented");
				expect(causeString).toContain("makeAuthTestLayer()");
			}
		});

		test("throws helpful error for createSession", async () => {
			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.createSession(1);
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Auth.Test)),
			);

			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				const causeString = String(result.cause);
				expect(causeString).toContain("Auth.Test: createSession not implemented");
			}
		});

		test("throws helpful error for deleteSession", async () => {
			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.deleteSession("token");
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Auth.Test)),
			);

			expect(Exit.isFailure(result)).toBe(true);
		});

		test("throws helpful error for deleteUserSessions", async () => {
			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.deleteUserSessions(1);
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Auth.Test)),
			);

			expect(Exit.isFailure(result)).toBe(true);
		});

		test("throws helpful error for deleteExpiredSessions", async () => {
			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.deleteExpiredSessions();
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(Auth.Test)),
			);

			expect(Exit.isFailure(result)).toBe(true);
		});
	});

	describe("makeAuthTestLayer factory", () => {
		test("allows mocking validateSession to succeed", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				avatarUrl: null,
			};
			const testLayer = makeAuthTestLayer({
				validateSession: (token) =>
					token === "valid-token"
						? Effect.succeed({
								token,
								expiresAt: new Date(Date.now() + 86400000),
								user: mockUser,
						  })
						: Effect.fail(new UnauthorizedError()),
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("valid-token");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.user.email).toBe("test@example.com");
			expect(result.token).toBe("valid-token");
		});

		test("allows mocking validateSession to fail", async () => {
			const testLayer = makeAuthTestLayer({
				validateSession: () => Effect.fail(new UnauthorizedError()),
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("invalid-token");
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(result)).toBe(true);
		});

		test("allows mocking createSession", async () => {
			let createdUserId = 0;
			const testLayer = makeAuthTestLayer({
				createSession: (userId) => {
					createdUserId = userId;
					return Effect.succeed({
						token: "mock-token-123",
						expiresAt: new Date(Date.now() + 86400000),
					});
				},
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.createSession(42);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.token).toBe("mock-token-123");
			expect(createdUserId).toBe(42);
		});

		test("unmocked methods still throw when partial mock provided", async () => {
			const testLayer = makeAuthTestLayer({
				validateSession: () =>
					Effect.succeed({
						token: "t",
						expiresAt: new Date(),
						user: { id: 1, email: "a@b.c", name: null, avatarUrl: null },
					}),
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				// createSession is not mocked
				return yield* auth.createSession(1);
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				const causeString = String(result.cause);
				expect(causeString).toContain("createSession not implemented");
			}
		});
	});

	describe("Auth.Live with Database", () => {
		test("validateSession returns UnauthorizedError for non-existent token", async () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("nonexistent-token");
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(layer)),
			);

			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				// Check it's an UnauthorizedError
				const causeString = String(result.cause);
				expect(causeString).toContain("UnauthorizedError");
			}
		});

		test("validateSession returns UnauthorizedError for expired session", async () => {
			const expiredDate = new Date(Date.now() - 86400000); // 1 day ago
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
				db.insert(schema.sessions)
					.values({
						userId: 1,
						token: "expired-token",
						expiresAt: expiredDate,
					})
					.run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("expired-token");
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(layer)),
			);

			expect(Exit.isFailure(result)).toBe(true);
		});

		test("validateSession returns UnauthorizedError for deleted user", async () => {
			const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users)
					.values({
						id: 1,
						email: "deleted@example.com",
						deletedAt: new Date(), // soft deleted
					})
					.run();
				db.insert(schema.sessions)
					.values({
						userId: 1,
						token: "deleted-user-token",
						expiresAt: futureDate,
					})
					.run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("deleted-user-token");
			});

			const result = await Effect.runPromiseExit(
				program.pipe(Effect.provide(layer)),
			);

			expect(Exit.isFailure(result)).toBe(true);
		});

		test("validateSession returns session with user for valid token", async () => {
			const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users)
					.values({
						id: 1,
						email: "valid@example.com",
						name: "Valid User",
						avatarUrl: "https://example.com/avatar.png",
					})
					.run();
				db.insert(schema.sessions)
					.values({
						userId: 1,
						token: "valid-session-token",
						expiresAt: futureDate,
					})
					.run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				return yield* auth.validateSession("valid-session-token");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(layer)),
			);

			expect(result.token).toBe("valid-session-token");
			expect(result.user.id).toBe(1);
			expect(result.user.email).toBe("valid@example.com");
			expect(result.user.name).toBe("Valid User");
			expect(result.user.avatarUrl).toBe("https://example.com/avatar.png");
		});

		test("createSession creates new session in database", async () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				const { token, expiresAt } = yield* auth.createSession(1);

				// Verify session exists in database
				const sessionInDb = db
					.select()
					.from(schema.sessions)
					.where(eq(schema.sessions.token, token))
					.get();

				return { token, expiresAt, sessionInDb };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(layer)),
			);

			expect(result.token).toHaveLength(64); // 32 bytes = 64 hex chars
			expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(result.sessionInDb).toBeDefined();
			expect(result.sessionInDb?.userId).toBe(1);
		});

		test("createSession generates unique tokens", async () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				const session1 = yield* auth.createSession(1);
				const session2 = yield* auth.createSession(1);
				return { token1: session1.token, token2: session2.token };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(layer)),
			);

			expect(result.token1).not.toBe(result.token2);
		});

		test("deleteSession removes session from database", async () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
				db.insert(schema.sessions)
					.values({
						userId: 1,
						token: "to-delete-token",
						expiresAt: new Date(Date.now() + 86400000),
					})
					.run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				// Verify session exists before deletion
				const beforeDelete = db
					.select()
					.from(schema.sessions)
					.where(eq(schema.sessions.token, "to-delete-token"))
					.get();

				yield* auth.deleteSession("to-delete-token");

				// Verify session is gone after deletion
				const afterDelete = db
					.select()
					.from(schema.sessions)
					.where(eq(schema.sessions.token, "to-delete-token"))
					.get();

				return { beforeDelete, afterDelete };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(layer)),
			);

			expect(result.beforeDelete).toBeDefined();
			expect(result.afterDelete).toBeUndefined();
		});

		test("deleteUserSessions removes all sessions for user", async () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
				db.insert(schema.users).values({ id: 2, email: "other@example.com" }).run();
				// User 1 has multiple sessions
				db.insert(schema.sessions)
					.values([
						{ userId: 1, token: "user1-session1", expiresAt: new Date(Date.now() + 86400000) },
						{ userId: 1, token: "user1-session2", expiresAt: new Date(Date.now() + 86400000) },
						{ userId: 1, token: "user1-session3", expiresAt: new Date(Date.now() + 86400000) },
					])
					.run();
				// User 2 has one session
				db.insert(schema.sessions)
					.values({ userId: 2, token: "user2-session1", expiresAt: new Date(Date.now() + 86400000) })
					.run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				const countBefore = db.select().from(schema.sessions).all().length;

				yield* auth.deleteUserSessions(1);

				const countAfter = db.select().from(schema.sessions).all().length;
				const remainingSessions = db.select().from(schema.sessions).all();

				return { countBefore, countAfter, remainingSessions };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(layer)),
			);

			expect(result.countBefore).toBe(4);
			expect(result.countAfter).toBe(1);
			expect(result.remainingSessions[0]?.token).toBe("user2-session1");
		});

		test("deleteExpiredSessions removes only expired sessions", async () => {
			const pastDate = new Date(Date.now() - 86400000); // 1 day ago
			const futureDate = new Date(Date.now() + 86400000); // 1 day from now

			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
				db.insert(schema.sessions)
					.values([
						{ userId: 1, token: "expired-1", expiresAt: pastDate },
						{ userId: 1, token: "expired-2", expiresAt: pastDate },
						{ userId: 1, token: "valid-1", expiresAt: futureDate },
					])
					.run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				const countBefore = db.select().from(schema.sessions).all().length;

				yield* auth.deleteExpiredSessions();

				const countAfter = db.select().from(schema.sessions).all().length;
				const remainingSessions = db.select().from(schema.sessions).all();

				return { countBefore, countAfter, remainingSessions };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(layer)),
			);

			expect(result.countBefore).toBe(3);
			expect(result.countAfter).toBe(1);
			expect(result.remainingSessions[0]?.token).toBe("valid-1");
		});
	});

	describe("token generation", () => {
		test("generates 64-character hex tokens", () => {
			const token = _generateTokenForTest();
			expect(token).toHaveLength(64);
			expect(token).toMatch(/^[0-9a-f]+$/);
		});

		test("generates unique tokens each time", () => {
			const tokens = new Set<string>();
			for (let i = 0; i < 100; i++) {
				tokens.add(_generateTokenForTest());
			}
			expect(tokens.size).toBe(100);
		});
	});

	describe("layer isolation", () => {
		test("each layer instance is independent", async () => {
			const layer1 = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "user1@example.com" }).run();
			});

			const layer2 = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "user2@example.com" }).run();
			});

			const program = Effect.gen(function* () {
				const auth = yield* Auth;
				const session = yield* auth.createSession(1);
				return yield* auth.validateSession(session.token);
			});

			const result1 = await Effect.runPromise(program.pipe(Effect.provide(layer1)));
			const result2 = await Effect.runPromise(program.pipe(Effect.provide(layer2)));

			expect(result1.user.email).toBe("user1@example.com");
			expect(result2.user.email).toBe("user2@example.com");
		});
	});
});
