import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const flights = sqliteTable(
	"flights",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		flightNumber: text("flight_number").notNull(),
		flightDate: text("flight_date").notNull(),
		origin: text("origin").notNull(),
		destination: text("destination").notNull(),
		scheduledDeparture: text("scheduled_departure").notNull(),
		scheduledArrival: text("scheduled_arrival").notNull(),
		currentStatus: text("current_status"),
		gate: text("gate"),
		terminal: text("terminal"),
		delayMinutes: integer("delay_minutes"),
		lastPolledAt: integer("last_polled_at"),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("flights_flight_number_flight_date_idx").on(table.flightNumber, table.flightDate),
		index("flights_scheduled_departure_idx").on(table.scheduledDeparture),
	],
);

export const trackedFlights = sqliteTable(
	"tracked_flights",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		chatId: text("chat_id").notNull(),
		flightId: integer("flight_id")
			.notNull()
			.references(() => flights.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	},
	(table) => [
		uniqueIndex("tracked_flights_chat_id_flight_id_unique").on(table.chatId, table.flightId),
		index("tracked_flights_chat_id_idx").on(table.chatId),
		index("tracked_flights_flight_id_idx").on(table.flightId),
	],
);

export const apiUsage = sqliteTable("api_usage", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	month: text("month").notNull().unique(),
	requestCount: integer("request_count").notNull().default(0),
	lastRequestAt: integer("last_request_at", { mode: "timestamp" }),
});

export const statusChanges = sqliteTable("status_changes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	flightId: integer("flight_id")
		.notNull()
		.references(() => flights.id, { onDelete: "cascade" }),
	oldStatus: text("old_status"),
	newStatus: text("new_status").notNull(),
	details: text("details"),
	detectedAt: integer("detected_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});
