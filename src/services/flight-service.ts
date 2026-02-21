import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { flights, trackedFlights } from "../db/schema.js";
import { normalizeOperationalStatus, shouldUseDepartureStandInfo } from "../utils/flight-status.js";
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

export async function getFlightByNumberAndDate(flightNumber: string, flightDate: string) {
	return db.query.flights.findFirst({
		where: and(eq(flights.flightNumber, flightNumber), eq(flights.flightDate, flightDate)),
	});
}

export async function updateFlightById(flightId: number, input: FlightInput): Promise<void> {
	await db
		.update(flights)
		.set({
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
			isActive: true,
		})
		.where(eq(flights.id, flightId));
}

export async function trackFlight(chatId: string, flightId: number) {
	const result = await db
		.insert(trackedFlights)
		.values({
			chatId,
			flightId,
		})
		.onConflictDoNothing({
			target: [trackedFlights.chatId, trackedFlights.flightId],
		})
		.returning({ id: trackedFlights.id });

	return result.length > 0;
}

export async function untrackFlight(chatId: string, flightId: number) {
	await db
		.delete(trackedFlights)
		.where(and(eq(trackedFlights.chatId, chatId), eq(trackedFlights.flightId, flightId)));

	const otherTrackers = await db.query.trackedFlights.findMany({
		where: eq(trackedFlights.flightId, flightId),
	});

	if (otherTrackers.length === 0) {
		await db.update(flights).set({ isActive: false }).where(eq(flights.id, flightId));
	}
}

export function convertAviationstackFlight(
	apiFlight: AviationstackFlight,
	requestedDate?: string,
): FlightInput {
	const delayMinutes = getDelayMinutes(apiFlight);
	const flightDate = requestedDate ?? apiFlight.flight_date;
	const normalizedStatus = normalizeOperationalStatus(
		apiFlight.flight_status,
		apiFlight.departure.scheduled,
		flightDate,
	);
	const shouldIncludeStandInfo = shouldUseDepartureStandInfo(
		apiFlight.departure.scheduled,
		flightDate,
		normalizedStatus,
	);

	return {
		flightNumber: apiFlight.flight.iata,
		flightDate,
		origin: apiFlight.departure.iata,
		destination: apiFlight.arrival.iata,
		scheduledDeparture: apiFlight.departure.scheduled,
		scheduledArrival: apiFlight.arrival.scheduled,
		currentStatus: normalizedStatus,
		gate: shouldIncludeStandInfo ? apiFlight.departure.gate || undefined : undefined,
		terminal: shouldIncludeStandInfo ? apiFlight.departure.terminal || undefined : undefined,
		delayMinutes,
	};
}

export function selectBestMatchingFlight(
	candidates: AviationstackFlight[],
	origin: string,
	destination: string,
): AviationstackFlight | undefined {
	return (
		candidates.find((candidate) => {
			return candidate.departure.iata === origin && candidate.arrival.iata === destination;
		}) ?? candidates[0]
	);
}

export function getDelayMinutes(apiFlight: AviationstackFlight): number | undefined {
	if (apiFlight.departure.delay && apiFlight.departure.delay > 0) {
		return apiFlight.departure.delay;
	}

	if (!apiFlight.departure.estimated || !apiFlight.departure.scheduled) {
		return undefined;
	}

	const estimatedMs = Date.parse(apiFlight.departure.estimated);
	const scheduledMs = Date.parse(apiFlight.departure.scheduled);
	if (Number.isNaN(estimatedMs) || Number.isNaN(scheduledMs)) {
		return undefined;
	}

	const diffMinutes = Math.round((estimatedMs - scheduledMs) / (60 * 1000));
	return diffMinutes > 0 ? diffMinutes : undefined;
}
