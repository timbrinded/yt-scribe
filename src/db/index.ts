import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.ts";

const DB_PATH = process.env.DATABASE_URL ?? "data/ytscribe.db";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: Database | null = null;
let db: Db | null = null;

function initDb(): Db {
	if (!sqlite || !db) {
		sqlite = new Database(DB_PATH);
		sqlite.exec("PRAGMA journal_mode = WAL;");
		db = drizzle(sqlite, { schema });
	}
	return db;
}

export function getDb(): Db {
	return initDb();
}

export function closeDb(): void {
	if (sqlite) {
		sqlite.close();
		sqlite = null;
		db = null;
	}
}

export { schema };
