/**
 * Database Effect Service
 *
 * Provides access to the SQLite database via Drizzle ORM.
 * This is a leaf service with no Effect-TS service dependencies.
 *
 * Uses Layer.scoped with acquireRelease to manage SQLite connection lifecycle:
 * - Acquire: Opens SQLite connection with WAL mode enabled
 * - Release: Closes SQLite connection on scope exit
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const { db } = yield* Database
 *   const users = db.select().from(schema.users).all()
 *   return users
 * })
 *
 * // Run with live database
 * await Effect.runPromise(program.pipe(Effect.provide(Database.Live)))
 *
 * // Run with in-memory test database
 * await Effect.runPromise(program.pipe(Effect.provide(Database.Test)))
 * ```
 */

import { Database as BunSqlite } from "bun:sqlite";
import { Context, Effect, Layer, Config } from "effect";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../db/schema";
import type { DatabaseService, DrizzleDatabase } from "./types";

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Database service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const { db } = yield* Database
 * const result = db.select().from(schema.users).all()
 * ```
 */
export class Database extends Context.Tag("@ytscribe/Database")<
	Database,
	DatabaseService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that connects to SQLite database.
	 *
	 * - Reads DATABASE_URL from environment (optional, defaults to data/ytscribe.db)
	 * - Enables WAL mode for better concurrent read/write performance
	 * - Enables foreign key constraints
	 * - Uses acquireRelease for proper cleanup on shutdown
	 */
	static readonly Live = Layer.scoped(
		Database,
		Effect.gen(function* () {
			// Read database path from config (optional, with default)
			const dbPath = yield* Config.string("DATABASE_URL").pipe(
				Config.withDefault("data/ytscribe.db"),
			);

			// Acquire SQLite connection with proper lifecycle management
			const sqlite = yield* Effect.acquireRelease(
				// Acquire: Open connection and configure pragmas
				Effect.sync(() => {
					const db = new BunSqlite(dbPath);
					// WAL mode for better concurrent performance
					db.exec("PRAGMA journal_mode = WAL;");
					// Enforce foreign key constraints
					db.exec("PRAGMA foreign_keys = ON;");
					return db;
				}),
				// Release: Close connection with logging
				(db) =>
					Effect.gen(function* () {
						yield* Effect.logDebug("Closing SQLite database connection...");
						db.close();
						yield* Effect.logDebug("SQLite database connection closed");
					}),
			);

			// Create Drizzle instance wrapping the SQLite connection
			const db: DrizzleDatabase = drizzle(sqlite, { schema });

			return { db } satisfies DatabaseService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer using in-memory SQLite database.
	 *
	 * - Creates fresh database for each test
	 * - Schema is created from scratch using raw SQL
	 * - No persistence between tests
	 */
	static readonly Test = Layer.scoped(
		Database,
		Effect.gen(function* () {
			// Acquire in-memory SQLite connection
			const sqlite = yield* Effect.acquireRelease(
				Effect.sync(() => {
					const db = new BunSqlite(":memory:");
					// Enable foreign key constraints for integrity testing
					db.exec("PRAGMA foreign_keys = ON;");
					return db;
				}),
				(db) =>
					Effect.sync(() => {
						db.close();
					}),
			);

			// Create schema in memory
			// Note: This mirrors the Drizzle schema manually
			// In a real migration setup, we'd use Drizzle migrations
			sqlite.exec(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					email TEXT NOT NULL UNIQUE,
					name TEXT,
					avatar_url TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					deleted_at TEXT
				);

				CREATE TABLE videos (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL REFERENCES users(id),
					youtube_url TEXT NOT NULL,
					youtube_id TEXT NOT NULL,
					title TEXT,
					duration INTEGER,
					thumbnail_url TEXT,
					status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE transcripts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					video_id INTEGER NOT NULL REFERENCES videos(id),
					content TEXT NOT NULL,
					segments TEXT,
					language TEXT DEFAULT 'en',
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE sessions (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL REFERENCES users(id),
					token TEXT NOT NULL UNIQUE,
					expires_at TEXT NOT NULL,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE chat_sessions (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					video_id INTEGER NOT NULL REFERENCES videos(id),
					user_id INTEGER NOT NULL REFERENCES users(id),
					title TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE messages (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
					role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
					content TEXT NOT NULL,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);

			// Create Drizzle instance
			const db: DrizzleDatabase = drizzle(sqlite, { schema });

			return { db } satisfies DatabaseService;
		}),
	);
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom database configuration.
 *
 * Use when you need to seed specific test data or configure the database differently.
 *
 * @example
 * ```typescript
 * const testLayer = makeDatabaseTestLayer((db) => {
 *   // Seed test data
 *   db.insert(schema.users).values({ email: "test@example.com" }).run()
 * })
 * ```
 */
export function makeDatabaseTestLayer(
	setup?: (db: DrizzleDatabase) => void,
): Layer.Layer<Database> {
	return Layer.scoped(
		Database,
		Effect.gen(function* () {
			const sqlite = yield* Effect.acquireRelease(
				Effect.sync(() => {
					const db = new BunSqlite(":memory:");
					db.exec("PRAGMA foreign_keys = ON;");
					return db;
				}),
				(db) =>
					Effect.sync(() => {
						db.close();
					}),
			);

			// Create schema
			sqlite.exec(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					email TEXT NOT NULL UNIQUE,
					name TEXT,
					avatar_url TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					deleted_at TEXT
				);

				CREATE TABLE videos (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL REFERENCES users(id),
					youtube_url TEXT NOT NULL,
					youtube_id TEXT NOT NULL,
					title TEXT,
					duration INTEGER,
					thumbnail_url TEXT,
					status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE transcripts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					video_id INTEGER NOT NULL REFERENCES videos(id),
					content TEXT NOT NULL,
					segments TEXT,
					language TEXT DEFAULT 'en',
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE sessions (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL REFERENCES users(id),
					token TEXT NOT NULL UNIQUE,
					expires_at TEXT NOT NULL,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE chat_sessions (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					video_id INTEGER NOT NULL REFERENCES videos(id),
					user_id INTEGER NOT NULL REFERENCES users(id),
					title TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE messages (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
					role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
					content TEXT NOT NULL,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);

			const db: DrizzleDatabase = drizzle(sqlite, { schema });

			// Run custom setup if provided
			if (setup) {
				setup(db);
			}

			return { db } satisfies DatabaseService;
		}),
	);
}
