import { eq } from "drizzle-orm";
import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { flights, statusChanges, trackedFlights } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { isPollingEnabled } from "./api-budget.js";
import { AviationstackAPI } from "./aviationstack.js";

const api = new AviationstackAPI();

const POLL_INTERVAL_FAR = 15 * 60 * 1000;
const POLL_INTERVAL_NEAR = 5 * 60 * 1000;
const POLL_INTERVAL_IMMINENT = 1 * 60 * 1000;
const HOURS_BEFORE_START_POLLING = 6;
const WORKER_CHECK_INTERVAL = 1 * 60 * 1000;

export function startPollingWorker() {
	logger.info("✓ Starting polling worker (budget-aware)");

	setInterval(async () => {
		if (await isPollingEnabled()) {
			await pollFlights();
		}
	}, WORKER_CHECK_INTERVAL);
}

function getPollInterval(scheduledDeparture: Date, now: Date): number {
	const hoursUntilDeparture =
		(scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);

	if (hoursUntilDeparture <= 1) return POLL_INTERVAL_IMMINENT;
	if (hoursUntilDeparture <= 3) return POLL_INTERVAL_NEAR;
	return POLL_INTERVAL_FAR;
}

async function pollFlights() {
	try {
		const now = new Date();
		const sixHoursFromNow = new Date(
			now.getTime() + HOURS_BEFORE_START_POLLING * 60 * 60 * 1000,
		);

		const activeFlights = await db
			.select()
			.from(flights)
			.where(eq(flights.isActive, true));

		for (const flight of activeFlights) {
			const scheduledDeparture = new Date(flight.scheduledDeparture);

			if (
				flight.currentStatus === "landed" ||
				flight.currentStatus === "cancelled"
			) {
				continue;
			}

			if (scheduledDeparture > sixHoursFromNow) {
				continue;
			}

			const pollInterval = getPollInterval(scheduledDeparture, now);
			const lastPolled = flight.lastPolledAt ? flight.lastPolledAt * 1000 : 0;
			const timeSinceLastPoll = now.getTime() - lastPolled;

			if (timeSinceLastPoll < pollInterval) {
				continue;
			}

			await pollFlight(flight.id, flight.flightNumber, flight.flightDate);
		}
	} catch (error) {
		logger.error("Error in polling worker:", error);
	}
}

async function pollFlight(
	flightId: number,
	flightNumber: string,
	flightDate: string,
) {
	try {
		const currentFlight = await db
			.select()
			.from(flights)
			.where(eq(flights.id, flightId))
			.limit(1);

		if (currentFlight.length === 0) {
			return;
		}

		const flight = currentFlight[0];
		const apiFlights = await api.getFlightsByNumber(flightNumber, flightDate);

		if (apiFlights.length === 0) {
			return;
		}

		const apiFlight = apiFlights[0];

		const changes: { field: string; from: string; to: string }[] = [];

		if (flight.currentStatus !== apiFlight.flight_status) {
			changes.push({
				field: "Status",
				from: flight.currentStatus || "N/A",
				to: apiFlight.flight_status,
			});
			await db.insert(statusChanges).values({
				flightId,
				oldStatus: flight.currentStatus,
				newStatus: apiFlight.flight_status,
			});
		}

		if (flight.gate !== apiFlight.departure.gate && apiFlight.departure.gate) {
			changes.push({
				field: "Gate",
				from: flight.gate || "N/A",
				to: apiFlight.departure.gate,
			});
		}

		if (
			flight.terminal !== apiFlight.departure.terminal &&
			apiFlight.departure.terminal
		) {
			changes.push({
				field: "Terminal",
				from: flight.terminal || "N/A",
				to: apiFlight.departure.terminal,
			});
		}

		if (
			flight.delayMinutes !== apiFlight.departure.delay &&
			apiFlight.departure.delay &&
			apiFlight.departure.delay > 0
		) {
			changes.push({
				field: "Delay",
				from: `${flight.delayMinutes || 0} min`,
				to: `${apiFlight.departure.delay} min`,
			});
		}

		if (changes.length > 0) {
			const trackers = await db
				.select()
				.from(trackedFlights)
				.where(eq(trackedFlights.flightId, flightId));

			for (const tracker of trackers) {
				let message = `🚨 *${flightNumber} Update*\n\n`;
				for (const change of changes) {
					message += `${change.field}: ${change.from} → ${change.to}\n`;
				}

				try {
					await bot.api.sendMessage(tracker.chatId, message, {
						parse_mode: "Markdown",
					});
				} catch (error) {
					logger.error(`Error sending alert to ${tracker.chatId}:`, error);
				}
			}
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

		logger.info(`✓ Updated flight ${flightNumber}`);
	} catch (error) {
		logger.error(`Error polling flight ${flightNumber}:`, error);
	}
}
