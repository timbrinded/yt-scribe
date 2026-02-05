#!/usr/bin/env bun
/**
 * Creates a test user in the database for e2e testing with Clerk.
 *
 * With Clerk authentication, sessions are managed externally by Clerk.
 * This helper creates the local user record that will be linked to
 * a Clerk user during the JIT provisioning flow.
 *
 * For e2e tests, use Clerk's test mode tokens or the Clerk Testing SDK.
 * See: https://clerk.com/docs/testing/overview
 *
 * Run with: bun e2e/helpers/create-test-session.ts
 * Outputs JSON with the created user info.
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";

const TEST_USER = {
	email: "e2e-test@example.com",
	name: "E2E Test User",
	// In real e2e tests, this would be set when the user authenticates via Clerk
	clerkId: null as string | null,
};

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
					clerkId: TEST_USER.clerkId,
				})
				.returning()
				.get();
		}

		if (!user) {
			console.error(JSON.stringify({ error: "Failed to create test user" }));
			process.exit(1);
		}

		// Output the result as JSON
		console.log(
			JSON.stringify({
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					clerkId: user.clerkId,
				},
				note: "With Clerk auth, use Clerk test tokens for e2e authentication. See https://clerk.com/docs/testing/overview",
			}),
		);
	} finally {
		sqlite.close();
	}
}

main();
