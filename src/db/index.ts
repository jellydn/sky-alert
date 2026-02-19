import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";

const sqlite = new Database("./data/sky-alert.db");
sqlite.run("PRAGMA journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
