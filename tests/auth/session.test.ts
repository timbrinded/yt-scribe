import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.ts";

function assertDefined<T>(value: T | undefined): asserts value is T {
	if (value === undefined) {
		throw new Error("Expected value to be defined");
	}
}

/**
 * Session management functions duplicated here for testing without importing
 * from the actual module (which uses the real database).
 */
function createTestSessionFunctions(
	db: ReturnType<typeof drizzle<typeof schema>>,
) {
	const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

	function generateToken(): string {
		const bytes = crypto.getRandomValues(new Uint8Array(32));
		return Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	function createSession(userId: number): { token: string; expiresAt: Date } {
		const token = generateToken();
		const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

		db.insert(schema.sessions)
			.values({
				userId,
				token,
				expiresAt,
			})
			.run();

		return { token, expiresAt };
	}

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

	function deleteSession(token: string): void {
		db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
	}

	function deleteUserSessions(userId: number): void {
		db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
	}

	return {
		createSession,
		validateSession,
		deleteSession,
		deleteUserSessions,
	};
}

describe("session management", () => {
	let sqlite: Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let sessionFns: ReturnType<typeof createTestSessionFunctions>;
	let testUserId: number;

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

		sessionFns = createTestSessionFunctions(db);
	});

	beforeEach(() => {
		// Clean up sessions between tests
		sqlite.exec("DELETE FROM sessions");
		sqlite.exec("DELETE FROM users");

		// Create a fresh test user
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
	});

	afterAll(() => {
		sqlite.close();
	});

	describe("createSession", () => {
		it("should create a session with a unique token", () => {
			const { token, expiresAt } = sessionFns.createSession(testUserId);

			expect(token).toBeDefined();
			expect(token.length).toBe(64); // 32 bytes as hex
			expect(expiresAt).toBeInstanceOf(Date);
			expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
		});

		it("should store the session in the database", () => {
			const { token } = sessionFns.createSession(testUserId);

			const stored = db
				.select()
				.from(schema.sessions)
				.where(eq(schema.sessions.token, token))
				.get();

			assertDefined(stored);
			expect(stored.userId).toBe(testUserId);
			expect(stored.token).toBe(token);
		});

		it("should generate unique tokens for multiple sessions", () => {
			const session1 = sessionFns.createSession(testUserId);
			const session2 = sessionFns.createSession(testUserId);

			expect(session1.token).not.toBe(session2.token);
		});

		it("should set expiration to 30 days in the future", () => {
			const { expiresAt } = sessionFns.createSession(testUserId);

			const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
			const expectedExpiry = Date.now() + thirtyDaysMs;

			// Allow 1 second tolerance for test execution time
			expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(1000);
		});
	});

	describe("validateSession", () => {
		it("should return session and user for valid token", () => {
			const { token } = sessionFns.createSession(testUserId);

			const result = sessionFns.validateSession(token);

			expect(result).not.toBeNull();
			if (result === null) throw new Error("Expected result to be defined");
			expect(result.session.token).toBe(token);
			expect(result.user.id).toBe(testUserId);
			expect(result.user.email).toBe("test@example.com");
			expect(result.user.name).toBe("Test User");
		});

		it("should return null for non-existent token", () => {
			const result = sessionFns.validateSession("nonexistent-token");

			expect(result).toBeNull();
		});

		it("should return null for expired session", () => {
			const { token } = sessionFns.createSession(testUserId);

			// Manually expire the session by updating the expiration
			const pastDate = new Date(Date.now() - 1000);
			db.update(schema.sessions)
				.set({ expiresAt: pastDate })
				.where(eq(schema.sessions.token, token))
				.run();

			const result = sessionFns.validateSession(token);

			expect(result).toBeNull();
		});
	});

	describe("deleteSession", () => {
		it("should delete a session by token", () => {
			const { token } = sessionFns.createSession(testUserId);

			// Verify session exists
			let stored = db
				.select()
				.from(schema.sessions)
				.where(eq(schema.sessions.token, token))
				.get();
			expect(stored).toBeDefined();

			sessionFns.deleteSession(token);

			// Verify session is deleted
			stored = db
				.select()
				.from(schema.sessions)
				.where(eq(schema.sessions.token, token))
				.get();
			expect(stored).toBeUndefined();
		});

		it("should not throw for non-existent token", () => {
			expect(() => {
				sessionFns.deleteSession("nonexistent-token");
			}).not.toThrow();
		});
	});

	describe("deleteUserSessions", () => {
		it("should delete all sessions for a user", () => {
			// Create multiple sessions
			sessionFns.createSession(testUserId);
			sessionFns.createSession(testUserId);
			sessionFns.createSession(testUserId);

			const before = db
				.select()
				.from(schema.sessions)
				.where(eq(schema.sessions.userId, testUserId))
				.all();
			expect(before.length).toBe(3);

			sessionFns.deleteUserSessions(testUserId);

			const after = db
				.select()
				.from(schema.sessions)
				.where(eq(schema.sessions.userId, testUserId))
				.all();
			expect(after.length).toBe(0);
		});
	});

	describe("sessions table", () => {
		it("should enforce foreign key constraint to users", () => {
			expect(() => {
				db.insert(schema.sessions)
					.values({
						userId: 99999,
						token: "test-token",
						expiresAt: new Date(Date.now() + 86400000),
					})
					.run();
			}).toThrow();
		});

		it("should enforce unique token constraint", () => {
			const { token } = sessionFns.createSession(testUserId);

			expect(() => {
				db.insert(schema.sessions)
					.values({
						userId: testUserId,
						token, // Same token
						expiresAt: new Date(Date.now() + 86400000),
					})
					.run();
			}).toThrow();
		});
	});
});
