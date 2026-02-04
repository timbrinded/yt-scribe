import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Elysia, t } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined): asserts value is T {
	if (value === undefined) {
		throw new Error("Expected value to be defined");
	}
}

interface UserResponse {
	id: number;
	email: string;
	name: string | null;
	avatarUrl: string | null;
}

interface ErrorResponse {
	error: string;
}

interface RouteResponse {
	route: string;
	userId: number;
}

/**
 * Creates a test auth middleware that uses the provided test database
 * instead of the real database.
 */
function createTestAuthMiddleware(
	db: ReturnType<typeof drizzle<typeof schema>>,
) {
	function validateSession(token: string) {
		const now = new Date();

		const result = db
			.select({
				session: schema.sessions,
				user: {
					id: schema.users.id,
					email: schema.users.email,
					name: schema.users.name,
					avatarUrl: schema.users.avatarUrl,
				},
			})
			.from(schema.sessions)
			.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
			.where(eq(schema.sessions.token, token))
			.get();

		if (!result || result.session.expiresAt <= now) {
			return null;
		}

		return result;
	}

	return new Elysia({ name: "test-auth-middleware" })
		.guard({
			cookie: t.Cookie({
				session: t.Optional(t.String()),
			}),
		})
		.macro({
			auth: {
				resolve({ cookie: { session }, status }) {
					const sessionToken = session?.value;

					if (!sessionToken || typeof sessionToken !== "string") {
						return status(401, { error: "Not authenticated" });
					}

					const result = validateSession(sessionToken);

					if (!result) {
						session?.remove();
						return status(401, { error: "Invalid or expired session" });
					}

					return { user: result.user };
				},
			},
		});
}

describe("auth middleware", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let testUserId: number;
	let validToken: string;

	beforeAll(() => {
		sqlite = new Database(":memory:");
		sqlite.exec("PRAGMA journal_mode = WAL;");
		sqlite.exec("PRAGMA foreign_keys = ON;");
		db = drizzle(sqlite, { schema });

		sqlite.exec(`
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL UNIQUE,
				name TEXT,
				avatar_url TEXT,
				created_at INTEGER NOT NULL,
				deleted_at INTEGER
			);

			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				token TEXT NOT NULL UNIQUE,
				expires_at INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
		`);
	});

	beforeEach(() => {
		// Clean up between tests
		sqlite.exec("DELETE FROM sessions");
		sqlite.exec("DELETE FROM users");

		// Create test user
		const result = db
			.insert(schema.users)
			.values({
				email: "test@example.com",
				name: "Test User",
			})
			.returning()
			.get();
		assertDefined(result);
		testUserId = result.id;

		// Create valid session
		validToken = `valid-test-token-${Date.now()}`;
		db.insert(schema.sessions)
			.values({
				userId: testUserId,
				token: validToken,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
			})
			.run();
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("401 without authentication", () => {
		it("should return 401 when no session cookie is provided", async () => {
			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia().use(authMiddleware).get(
				"/protected",
				({ user }) => {
					return { userId: user.id, email: user.email };
				},
				{ auth: true },
			);

			const response = await app.handle(
				new Request("http://localhost/protected"),
			);

			expect(response.status).toBe(401);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Not authenticated");
		});

		it("should return 401 when session cookie is empty", async () => {
			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia().use(authMiddleware).get(
				"/protected",
				({ user }) => {
					return { userId: user.id, email: user.email };
				},
				{ auth: true },
			);

			const response = await app.handle(
				new Request("http://localhost/protected", {
					headers: {
						Cookie: "session=",
					},
				}),
			);

			expect(response.status).toBe(401);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Not authenticated");
		});

		it("should return 401 when session token is invalid", async () => {
			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia().use(authMiddleware).get(
				"/protected",
				({ user }) => {
					return { userId: user.id, email: user.email };
				},
				{ auth: true },
			);

			const response = await app.handle(
				new Request("http://localhost/protected", {
					headers: {
						Cookie: "session=invalid-token-that-does-not-exist",
					},
				}),
			);

			expect(response.status).toBe(401);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Invalid or expired session");
		});

		it("should return 401 when session is expired", async () => {
			// Create an expired session
			const expiredToken = `expired-token-${Date.now()}`;
			db.insert(schema.sessions)
				.values({
					userId: testUserId,
					token: expiredToken,
					expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
				})
				.run();

			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia().use(authMiddleware).get(
				"/protected",
				({ user }) => {
					return { userId: user.id, email: user.email };
				},
				{ auth: true },
			);

			const response = await app.handle(
				new Request("http://localhost/protected", {
					headers: {
						Cookie: `session=${expiredToken}`,
					},
				}),
			);

			expect(response.status).toBe(401);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error).toBe("Invalid or expired session");
		});
	});

	describe("authenticated requests", () => {
		it("should attach user to context with valid session", async () => {
			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia().use(authMiddleware).get(
				"/protected",
				({ user }) => {
					return { userId: user.id, email: user.email, name: user.name };
				},
				{ auth: true },
			);

			const response = await app.handle(
				new Request("http://localhost/protected", {
					headers: {
						Cookie: `session=${validToken}`,
					},
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				userId: number;
				email: string;
				name: string | null;
			};
			expect(body.userId).toBe(testUserId);
			expect(body.email).toBe("test@example.com");
			expect(body.name).toBe("Test User");
		});

		it("should provide correct user data in context", async () => {
			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia().use(authMiddleware).get(
				"/me",
				({ user }) => {
					return {
						id: user.id,
						email: user.email,
						name: user.name,
						avatarUrl: user.avatarUrl,
					};
				},
				{ auth: true },
			);

			const response = await app.handle(
				new Request("http://localhost/me", {
					headers: {
						Cookie: `session=${validToken}`,
					},
				}),
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as UserResponse;
			expect(body.id).toBe(testUserId);
			expect(body.email).toBe("test@example.com");
			expect(body.name).toBe("Test User");
			expect(body.avatarUrl).toBeNull();
		});

		it("should allow multiple protected routes with the same middleware", async () => {
			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia()
				.use(authMiddleware)
				.get(
					"/protected/one",
					({ user }) => ({ route: "one", userId: user.id }),
					{ auth: true },
				)
				.get(
					"/protected/two",
					({ user }) => ({
						route: "two",
						userId: user.id,
					}),
					{ auth: true },
				);

			const response1 = await app.handle(
				new Request("http://localhost/protected/one", {
					headers: { Cookie: `session=${validToken}` },
				}),
			);
			const response2 = await app.handle(
				new Request("http://localhost/protected/two", {
					headers: { Cookie: `session=${validToken}` },
				}),
			);

			expect(response1.status).toBe(200);
			expect(response2.status).toBe(200);

			const body1 = (await response1.json()) as RouteResponse;
			const body2 = (await response2.json()) as RouteResponse;

			expect(body1.route).toBe("one");
			expect(body1.userId).toBe(testUserId);
			expect(body2.route).toBe("two");
			expect(body2.userId).toBe(testUserId);
		});
	});

	describe("user isolation", () => {
		it("should return the correct user for each session", async () => {
			// Create a second user
			const user2 = db
				.insert(schema.users)
				.values({
					email: "other@example.com",
					name: "Other User",
				})
				.returning()
				.get();
			assertDefined(user2);

			// Create session for second user
			const user2Token = `user2-token-${Date.now()}`;
			db.insert(schema.sessions)
				.values({
					userId: user2.id,
					token: user2Token,
					expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
				})
				.run();

			const authMiddleware = createTestAuthMiddleware(db);
			const app = new Elysia()
				.use(authMiddleware)
				.get("/whoami", ({ user }) => ({ id: user.id, email: user.email }), {
					auth: true,
				});

			// Test first user
			const response1 = await app.handle(
				new Request("http://localhost/whoami", {
					headers: { Cookie: `session=${validToken}` },
				}),
			);
			const body1 = (await response1.json()) as { id: number; email: string };
			expect(body1.email).toBe("test@example.com");

			// Test second user
			const response2 = await app.handle(
				new Request("http://localhost/whoami", {
					headers: { Cookie: `session=${user2Token}` },
				}),
			);
			const body2 = (await response2.json()) as { id: number; email: string };
			expect(body2.email).toBe("other@example.com");
		});
	});
});
