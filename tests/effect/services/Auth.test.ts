/**
 * Tests for the Effect-TS Auth service.
 */

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
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
		it.effect("throws helpful error for validateSession", () =>
			Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.validateSession("any-token").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const causeString = String(exit.cause);
					expect(causeString).toContain("Auth.Test: validateSession not implemented");
					expect(causeString).toContain("makeAuthTestLayer()");
				}
			}).pipe(Effect.provide(Auth.Test)),
		);

		it.effect("throws helpful error for createSession", () =>
			Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.createSession(1).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const causeString = String(exit.cause);
					expect(causeString).toContain("Auth.Test: createSession not implemented");
				}
			}).pipe(Effect.provide(Auth.Test)),
		);

		it.effect("throws helpful error for deleteSession", () =>
			Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.deleteSession("token").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
			}).pipe(Effect.provide(Auth.Test)),
		);

		it.effect("throws helpful error for deleteUserSessions", () =>
			Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.deleteUserSessions(1).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
			}).pipe(Effect.provide(Auth.Test)),
		);

		it.effect("throws helpful error for deleteExpiredSessions", () =>
			Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.deleteExpiredSessions().pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
			}).pipe(Effect.provide(Auth.Test)),
		);
	});

	describe("makeAuthTestLayer factory", () => {
		it.effect("allows mocking validateSession to succeed", () =>
			Effect.gen(function* () {
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

				const auth = yield* Effect.provide(Auth, testLayer);
				const result = yield* auth.validateSession("valid-token");

				expect(result.user.email).toBe("test@example.com");
				expect(result.token).toBe("valid-token");
			}),
		);

		it.effect("allows mocking validateSession to fail", () =>
			Effect.gen(function* () {
				const testLayer = makeAuthTestLayer({
					validateSession: () => Effect.fail(new UnauthorizedError()),
				});

				const auth = yield* Effect.provide(Auth, testLayer);
				const exit = yield* auth.validateSession("invalid-token").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
			}),
		);

		it.effect("allows mocking createSession", () =>
			Effect.gen(function* () {
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

				const auth = yield* Effect.provide(Auth, testLayer);
				const result = yield* auth.createSession(42);

				expect(result.token).toBe("mock-token-123");
				expect(createdUserId).toBe(42);
			}),
		);

		it.effect("unmocked methods still throw when partial mock provided", () =>
			Effect.gen(function* () {
				const testLayer = makeAuthTestLayer({
					validateSession: () =>
						Effect.succeed({
							token: "t",
							expiresAt: new Date(),
							user: { id: 1, email: "a@b.c", name: null, avatarUrl: null },
						}),
				});

				const auth = yield* Effect.provide(Auth, testLayer);
				// createSession is not mocked
				const exit = yield* auth.createSession(1).pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const causeString = String(exit.cause);
					expect(causeString).toContain("createSession not implemented");
				}
			}),
		);
	});

	describe("Auth.Live with Database", () => {
		it.scoped("validateSession returns UnauthorizedError for non-existent token", () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
			});

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.validateSession("nonexistent-token").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					// Check it's an UnauthorizedError
					const causeString = String(exit.cause);
					expect(causeString).toContain("UnauthorizedError");
				}
			}).pipe(Effect.provide(layer));
		});

		it.scoped("validateSession returns UnauthorizedError for expired session", () => {
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

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.validateSession("expired-token").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("validateSession returns UnauthorizedError for deleted user", () => {
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

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const exit = yield* auth.validateSession("deleted-user-token").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("validateSession returns session with user for valid token", () => {
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

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const result = yield* auth.validateSession("valid-session-token");

				expect(result.token).toBe("valid-session-token");
				expect(result.user.id).toBe(1);
				expect(result.user.email).toBe("valid@example.com");
				expect(result.user.name).toBe("Valid User");
				expect(result.user.avatarUrl).toBe("https://example.com/avatar.png");
			}).pipe(Effect.provide(layer));
		});

		it.scoped("createSession creates new session in database", () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
			});

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				const { token, expiresAt } = yield* auth.createSession(1);

				// Verify session exists in database
				const sessionInDb = db
					.select()
					.from(schema.sessions)
					.where(eq(schema.sessions.token, token))
					.get();

				expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
				expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
				expect(sessionInDb).toBeDefined();
				expect(sessionInDb?.userId).toBe(1);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("createSession generates unique tokens", () => {
			const layer = createAuthLiveWithDb((db) => {
				db.insert(schema.users).values({ id: 1, email: "test@example.com" }).run();
			});

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const session1 = yield* auth.createSession(1);
				const session2 = yield* auth.createSession(1);

				expect(session1.token).not.toBe(session2.token);
			}).pipe(Effect.provide(layer));
		});

		it.scoped("deleteSession removes session from database", () => {
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

			return Effect.gen(function* () {
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

				expect(beforeDelete).toBeDefined();
				expect(afterDelete).toBeUndefined();
			}).pipe(Effect.provide(layer));
		});

		it.scoped("deleteUserSessions removes all sessions for user", () => {
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

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				const countBefore = db.select().from(schema.sessions).all().length;

				yield* auth.deleteUserSessions(1);

				const countAfter = db.select().from(schema.sessions).all().length;
				const remainingSessions = db.select().from(schema.sessions).all();

				expect(countBefore).toBe(4);
				expect(countAfter).toBe(1);
				expect(remainingSessions[0]?.token).toBe("user2-session1");
			}).pipe(Effect.provide(layer));
		});

		it.scoped("deleteExpiredSessions removes only expired sessions", () => {
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

			return Effect.gen(function* () {
				const auth = yield* Auth;
				const { db } = yield* Database;

				const countBefore = db.select().from(schema.sessions).all().length;

				yield* auth.deleteExpiredSessions();

				const countAfter = db.select().from(schema.sessions).all().length;
				const remainingSessions = db.select().from(schema.sessions).all();

				expect(countBefore).toBe(3);
				expect(countAfter).toBe(1);
				expect(remainingSessions[0]?.token).toBe("valid-1");
			}).pipe(Effect.provide(layer));
		});
	});

	describe("token generation", () => {
		it("generates 64-character hex tokens", () => {
			const token = _generateTokenForTest();
			expect(token).toHaveLength(64);
			expect(token).toMatch(/^[0-9a-f]+$/);
		});

		it("generates unique tokens each time", () => {
			const tokens = new Set<string>();
			for (let i = 0; i < 100; i++) {
				tokens.add(_generateTokenForTest());
			}
			expect(tokens.size).toBe(100);
		});
	});

	describe("layer isolation", () => {
		it.effect("each layer instance is independent", () => {
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

			return Effect.gen(function* () {
				const result1 = yield* Effect.scoped(program.pipe(Effect.provide(layer1)));
				const result2 = yield* Effect.scoped(program.pipe(Effect.provide(layer2)));

				expect(result1.user.email).toBe("user1@example.com");
				expect(result2.user.email).toBe("user2@example.com");
			});
		});
	});
});
