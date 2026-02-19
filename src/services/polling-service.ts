import { and, eq, gt, lt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { flights } from "../db/schema.js";
import { AviationstackAPI } from "./aviationstack.js";

const api = new AviationstackAPI();

const POLL_INTERVAL_LONG = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_SHORT = 1 * 60 * 1000; // 1 minute
const HOURS_BEFORE_DEPARTURE_FOR_SHORT_POLL = 3;
const HOURS_AFTER_ARRIVAL_TO_STOP_POLLING = 2;

const pollIntervals = new Map<number, NodeJS.Timeout>();

export function startPollingWorker() {
	console.log("✓ Starting polling worker");

	setInterval(async () => {
		await pollFlights();
	}, POLL_INTERVAL_LONG);
}

async function pollFlights() {
	try {
		const now = new Date();
		const threeHoursAgo = new Date(
			now.getTime() - HOURS_BEFORE_DEPARTURE_FOR_SHORT_POLL * 60 * 60 * 1000,
		);
		const threeHoursFromNow = new Date(
			now.getTime() + HOURS_BEFORE_DEPARTURE_FOR_SHORT_POLL * 60 * 60 * 1000,
		);
		const twoHoursAgo = new Date(
			now.getTime() - HOURS_AFTER_ARRIVAL_TO_STOP_POLLING * 60 * 60 * 1000,
		);

		const activeFlights = await db
			.select()
			.from(flights)
			.where(
				and(
					eq(flights.isActive, true),
					or(
						gt(flights.scheduledDeparture, twoHoursAgo.toISOString()),
						eq(flights.currentStatus, "cancelled"),
					),
				),
			);

		for (const flight of activeFlights) {
			const scheduledDeparture = new Date(flight.scheduledDeparture);

			const shouldStopPolling =
				flight.currentStatus === "landed" && scheduledDeparture < twoHoursAgo;

			if (shouldStopPolling) {
				await db
					.update(flights)
					.set({ isActive: false })
					.where(eq(flights.id, flight.id));

				const existingInterval = pollIntervals.get(flight.id);
				if (existingInterval) {
					clearInterval(existingInterval);
					pollIntervals.delete(flight.id);
				}
				continue;
			}

			const isNearDeparture = scheduledDeparture < threeHoursFromNow;
			const pollInterval = isNearDeparture
				? POLL_INTERVAL_SHORT
				: POLL_INTERVAL_LONG;

			const existingInterval = pollIntervals.get(flight.id);
			if (existingInterval) {
				continue;
			}

			const intervalId = setInterval(async () => {
				await pollFlight(flight.id, flight.flightNumber, flight.flightDate);
			}, pollInterval);

			pollIntervals.set(flight.id, intervalId);

			await pollFlight(flight.id, flight.flightNumber, flight.flightDate);
		}
	} catch (error) {
		console.error("Error in polling worker:", error);
	}
}

async function pollFlight(
	flightId: number,
	flightNumber: string,
	flightDate: string,
) {
	try {
		const apiFlight = await api.getFlightByNumber(flightNumber, flightDate);

		if (!apiFlight) {
			return;
		}

		await db
			.update(flights)
			.set({
				currentStatus: apiFlight.flight_status,
				gate: apiFlight.departure.gate || undefined,
				terminal: apiFlight.departure.terminal || undefined,
				delayMinutes: apiFlight.departure.delay || undefined,
				lastPolledAt: Math.floor(Date.now() / 1000),
			})
			.where(eq(flights.id, flightId));

		console.log(`✓ Updated flight ${flightNumber}`);
	} catch (error) {
		console.error(`Error polling flight ${flightNumber}:`, error);
	}
}
