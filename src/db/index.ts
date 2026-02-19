import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";

const DATABASE_PATH = "./data/sky-alert.db";

// Ensure data directory exists before opening SQLite file.
mkdirSync(dirname(DATABASE_PATH), { recursive: true });

const sqlite = new Database(DATABASE_PATH);
sqlite.run("PRAGMA journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

export function closeDatabase() {
	sqlite.close();
}
