#!/usr/bin/env bun
/**
 * Creates a test user and session in the database.
 * Run with: bun e2e/helpers/create-test-session.ts
 * Outputs JSON with the session token.
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";

const TEST_USER = {
	email: "e2e-test@example.com",
	name: "E2E Test User",
};

function generateToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function main() {
	const dbPath = process.env.DATABASE_URL ?? "data/ytscribe.db";
	const sqlite = new Database(dbPath);
	sqlite.exec("PRAGMA journal_mode = WAL;");
	const db = drizzle(sqlite, { schema });

	try {
		// Find or create test user
		let user = db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, TEST_USER.email))
			.get();

		if (!user) {
			user = db
				.insert(schema.users)
				.values({
					email: TEST_USER.email,
					name: TEST_USER.name,
				})
				.returning()
				.get();
		}

		if (!user) {
			console.error(JSON.stringify({ error: "Failed to create test user" }));
			process.exit(1);
		}

		// Create a fresh session token
		const token = generateToken();
		const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

		// Delete any existing sessions for this user (clean slate)
		db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id)).run();

		// Create new session
		db.insert(schema.sessions)
			.values({
				userId: user.id,
				token,
				expiresAt,
			})
			.run();

		// Output the result as JSON
		console.log(
			JSON.stringify({
				token,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
				},
				expiresAt: expiresAt.toISOString(),
			}),
		);
	} finally {
		sqlite.close();
	}
}

main();
