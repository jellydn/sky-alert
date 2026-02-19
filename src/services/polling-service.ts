import { eq } from "drizzle-orm";
import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { flights, statusChanges, trackedFlights } from "../db/schema.js";
import { isPollingEnabled } from "./api-budget.js";
import { AviationstackAPI } from "./aviationstack.js";

const api = new AviationstackAPI();

const POLL_INTERVAL_FAR = 15 * 60 * 1000; // 15 minutes (> 3 hours from departure)
const POLL_INTERVAL_NEAR = 5 * 60 * 1000; // 5 minutes (1-3 hours from departure)
const POLL_INTERVAL_IMMINENT = 1 * 60 * 1000; // 1 minute (< 1 hour from departure)
const HOURS_BEFORE_START_POLLING = 6;
const WORKER_CHECK_INTERVAL = 1 * 60 * 1000; // check every minute

export function startPollingWorker() {
	console.log("✓ Starting polling worker (budget-aware)");

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
		console.error("Error in polling worker:", error);
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
		const apiFlight = await api.getFlightByNumber(flightNumber, flightDate);

		if (!apiFlight) {
			return;
		}

		const oldStatus = flight.currentStatus;
		const newStatus = apiFlight.flight_status;
		const oldGate = flight.gate;
		const newGate = apiFlight.departure.gate;
		const oldTerminal = flight.terminal;
		const newTerminal = apiFlight.departure.terminal;
		const oldDelay = flight.delayMinutes;
		const newDelay = apiFlight.departure.delay;

		const statusChanged = oldStatus !== newStatus;
		const gateChanged = oldGate !== newGate && newGate !== undefined;
		const terminalChanged =
			oldTerminal !== newTerminal && newTerminal !== undefined;
		const delayChanged = oldDelay !== newDelay;

		if (statusChanged || gateChanged || terminalChanged) {
			let details = "";

			if (statusChanged) {
				await db.insert(statusChanges).values({
					flightId,
					oldStatus,
					newStatus,
					details: undefined,
				});
			}

			if (delayChanged && newDelay && newDelay > 0) {
				details += `Delay: ${newDelay} min\n`;
			}

			if (gateChanged) {
				details += `Gate: ${oldGate || "N/A"} → ${newGate}\n`;
			}

			if (terminalChanged) {
				details += `Terminal: ${oldTerminal || "N/A"} → ${newTerminal}\n`;
			}

			const trackers = await db
				.select()
				.from(trackedFlights)
				.where(eq(trackedFlights.flightId, flightId));

			for (const tracker of trackers) {
				let message = `🚨 *${flightNumber} Update*\n\n`;

				if (statusChanged) {
					message += `Status: ${oldStatus || "N/A"} → ${newStatus}\n`;
				}

				if (details) {
					message += `\n${details}`;
				}

				try {
					await bot.api.sendMessage(tracker.chatId, message, {
						parse_mode: "Markdown",
					});
				} catch (error) {
					console.error(`Error sending alert to ${tracker.chatId}:`, error);
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

		console.log(`✓ Updated flight ${flightNumber}`);
	} catch (error) {
		console.error(`Error polling flight ${flightNumber}:`, error);
	}
}
