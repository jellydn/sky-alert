import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { flights, trackedFlights } from "../db/schema.js";
import type { AviationstackFlight } from "./aviationstack.js";

export interface FlightInput {
	flightNumber: string;
	flightDate: string;
	origin: string;
	destination: string;
	scheduledDeparture: string;
	scheduledArrival: string;
	currentStatus?: string;
	gate?: string;
	terminal?: string;
	delayMinutes?: number;
}

export async function createFlight(input: FlightInput): Promise<number | null> {
	const result = await db
		.insert(flights)
		.values({
			flightNumber: input.flightNumber,
			flightDate: input.flightDate,
			origin: input.origin,
			destination: input.destination,
			scheduledDeparture: input.scheduledDeparture,
			scheduledArrival: input.scheduledArrival,
			currentStatus: input.currentStatus,
			gate: input.gate,
			terminal: input.terminal,
			delayMinutes: input.delayMinutes,
		})
		.returning({ id: flights.id });

	return result[0]?.id || null;
}

export async function getFlightById(id: number) {
	return db.query.flights.findFirst({
		where: eq(flights.id, id),
	});
}

export async function getFlightByNumberAndDate(
	flightNumber: string,
	flightDate: string,
) {
	return db.query.flights.findFirst({
		where: and(
			eq(flights.flightNumber, flightNumber),
			eq(flights.flightDate, flightDate),
		),
	});
}

export async function trackFlight(chatId: string, flightId: number) {
	const existing = await db.query.trackedFlights.findFirst({
		where: and(
			eq(trackedFlights.chatId, chatId),
			eq(trackedFlights.flightId, flightId),
		),
	});

	if (existing) {
		return false;
	}

	await db.insert(trackedFlights).values({
		chatId,
		flightId,
	});

	return true;
}

export async function untrackFlight(chatId: string, flightId: number) {
	await db
		.delete(trackedFlights)
		.where(
			and(
				eq(trackedFlights.chatId, chatId),
				eq(trackedFlights.flightId, flightId),
			),
		);

	const otherTrackers = await db.query.trackedFlights.findMany({
		where: eq(trackedFlights.flightId, flightId),
	});

	if (otherTrackers.length === 0) {
		await db
			.update(flights)
			.set({ isActive: false })
			.where(eq(flights.id, flightId));
	}
}

export function convertAviationstackFlight(
	apiFlight: AviationstackFlight,
): FlightInput {
	return {
		flightNumber: apiFlight.flight.iata,
		flightDate: apiFlight.flight_date,
		origin: apiFlight.departure.iata,
		destination: apiFlight.arrival.iata,
		scheduledDeparture: apiFlight.departure.scheduled,
		scheduledArrival: apiFlight.arrival.scheduled,
		currentStatus: apiFlight.flight_status,
		gate: apiFlight.departure.gate || undefined,
		terminal: apiFlight.departure.terminal || undefined,
		delayMinutes: apiFlight.departure.delay || undefined,
	};
}
