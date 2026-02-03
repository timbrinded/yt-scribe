import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "../db";
import { type Session, sessions, users } from "../db/schema";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export interface SessionWithUser {
	session: Session;
	user: {
		id: number;
		email: string;
		name: string | null;
		avatarUrl: string | null;
	};
}

/**
 * Creates a new session for a user and returns the session token.
 */
export function createSession(userId: number): {
	token: string;
	expiresAt: Date;
} {
	const db = getDb();
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
}

/**
 * Validates a session token and returns the session with user data if valid.
 * Returns null if the session is invalid or expired.
 */
export function validateSession(token: string): SessionWithUser | null {
	const db = getDb();
	const now = new Date();

	const result = db
		.select({
			session: sessions,
			user: {
				id: users.id,
				email: users.email,
				name: users.name,
				avatarUrl: users.avatarUrl,
			},
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
		.get();

	if (!result) {
		return null;
	}

	return result;
}

/**
 * Deletes a session by token.
 */
export function deleteSession(token: string): void {
	const db = getDb();
	db.delete(sessions).where(eq(sessions.token, token)).run();
}

/**
 * Deletes all sessions for a user.
 */
export function deleteUserSessions(userId: number): void {
	const db = getDb();
	db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/**
 * Deletes expired sessions (cleanup function).
 */
export function deleteExpiredSessions(): void {
	const db = getDb();
	const now = new Date();
	db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
}
