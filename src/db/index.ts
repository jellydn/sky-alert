import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { logger } from "../utils/logger.js";
import * as schema from "./schema.js";

const DATABASE_PATH = "./data/sky-alert.db";

// Ensure data directory exists before opening SQLite file.
mkdirSync(dirname(DATABASE_PATH), { recursive: true });

const sqlite = new Database(DATABASE_PATH);
sqlite.run("PRAGMA journal_mode = WAL");

function ensureTrackedFlightsUpdatedAtColumn() {
	try {
		const columns = sqlite.query("PRAGMA table_info(tracked_flights)").all() as Array<{
			name?: string;
		}>;
		const hasUpdatedAt = columns.some((column) => column.name === "updated_at");

		if (hasUpdatedAt) {
			return;
		}

		logger.warn("Schema drift detected: adding tracked_flights.updated_at column");
		sqlite.run(
			"ALTER TABLE `tracked_flights` ADD COLUMN `updated_at` integer DEFAULT (unixepoch()) NOT NULL",
		);
		sqlite.run(
			"UPDATE `tracked_flights` SET `updated_at` = `created_at` WHERE `created_at` IS NOT NULL",
		);
		logger.info("✓ Added tracked_flights.updated_at compatibility column");
	} catch (error) {
		logger.error(
			"Failed runtime migration for tracked_flights.updated_at (ALTER TABLE/UPDATE)",
			error,
		);
	}
}

ensureTrackedFlightsUpdatedAtColumn();

export const db = drizzle(sqlite, { schema });

export function closeDatabase() {
	sqlite.close();
}
