import { eq } from "drizzle-orm";
import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { flights, statusChanges, trackedFlights } from "../db/schema.js";
import {
	isTerminalFlightStatus,
	normalizeOperationalStatus,
	preferKnownStatus,
	shouldUseDepartureStandInfo,
	shouldUseStatusFallback,
} from "../utils/flight-status.js";
import { logger } from "../utils/logger.js";
import { isPollingEnabled } from "./api-budget.js";
import { aviationstackApi } from "./aviationstack.js";
import { getDelayMinutes, selectBestMatchingFlight } from "./flight-service.js";
import { getFlightAwareFallback } from "./flightaware-fallback.js";
import { getFlightStatsFallback } from "./flightstats-fallback.js";

const POLL_INTERVAL_FAR = 15 * 60 * 1000;
const POLL_INTERVAL_NEAR = 5 * 60 * 1000;
const POLL_INTERVAL_IMMINENT = 1 * 60 * 1000;
const HOURS_BEFORE_START_POLLING = 6;
const WORKER_CHECK_INTERVAL = 1 * 60 * 1000;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

function parseCarrierAndNumber(flightCode: string): { carrier?: string; number?: string } {
	const match = flightCode.match(/^([A-Z]{2,3})(\d{1,4})$/);
	if (!match) {
		return {};
	}

	return { carrier: match[1], number: match[2] };
}

export function startPollingWorker() {
	if (pollingTimer) {
		return;
	}

	logger.info("✓ Starting polling worker (budget-aware)");

	pollingTimer = setInterval(async () => {
		if (await isPollingEnabled()) {
			await pollFlights();
		}
	}, WORKER_CHECK_INTERVAL);
}

export function stopPollingWorker() {
	if (pollingTimer) {
		clearInterval(pollingTimer);
		pollingTimer = null;
		logger.info("✓ Polling worker stopped");
	}
}

function getPollInterval(scheduledDeparture: Date, now: Date): number {
	const hoursUntilDeparture = (scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);

	if (hoursUntilDeparture <= 1) return POLL_INTERVAL_IMMINENT;
	if (hoursUntilDeparture <= 3) return POLL_INTERVAL_NEAR;
	return POLL_INTERVAL_FAR;
}

async function pollFlights() {
	try {
		const now = new Date();
		const sixHoursFromNow = new Date(now.getTime() + HOURS_BEFORE_START_POLLING * 60 * 60 * 1000);

		const activeFlights = await db.select().from(flights).where(eq(flights.isActive, true));

		for (const flight of activeFlights) {
			const scheduledDeparture = new Date(flight.scheduledDeparture);

			if (isTerminalFlightStatus(flight.currentStatus || undefined)) {
				await db.update(flights).set({ isActive: false }).where(eq(flights.id, flight.id));
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

async function pollFlight(flightId: number, flightNumber: string, flightDate: string) {
	try {
		const currentFlight = await db.select().from(flights).where(eq(flights.id, flightId)).limit(1);

		if (currentFlight.length === 0) {
			return;
		}

		const flight = currentFlight[0];
		const apiFlights = await aviationstackApi.getFlightsByNumber(flightNumber, flightDate, {
			bypassCache: true,
		});

		if (apiFlights.length === 0) {
			return;
		}

		const apiFlight = selectBestMatchingFlight(apiFlights, flight.origin, flight.destination);
		if (!apiFlight) {
			return;
		}
		const nowMs = Date.now();
		let nextDelayMinutes = getDelayMinutes(apiFlight);
		let nextStatus = preferKnownStatus(
			flight.currentStatus || undefined,
			normalizeOperationalStatus(
				apiFlight.flight_status,
				apiFlight.departure.scheduled,
				flight.flightDate,
				nowMs,
				apiFlight.flight_date,
			),
		);
		let shouldIncludeStandInfo = shouldUseDepartureStandInfo(
			apiFlight.departure.scheduled,
			flight.flightDate,
			nextStatus,
			nowMs,
		);
		let nextGate = flight.gate || undefined;
		let nextTerminal = shouldIncludeStandInfo
			? apiFlight.departure.terminal || undefined
			: flight.terminal || undefined;
		if (shouldIncludeStandInfo && apiFlight.departure.gate) {
			nextGate = apiFlight.departure.gate;
		}
		let flightStatsFallbackUsed = false;

		if (shouldUseStatusFallback(nextStatus, nextDelayMinutes)) {
			const parsedCode = parseCarrierAndNumber(flightNumber);
			const carrierCode =
				apiFlight.airline.iata || parsedCode.carrier || apiFlight.flight.iata.slice(0, 2);
			const flightNo = apiFlight.flight.number || parsedCode.number || "";
			const flightStatsFallback = flightNo
				? await getFlightStatsFallback(carrierCode, flightNo)
				: undefined;

			if (flightStatsFallback) {
				flightStatsFallbackUsed = true;
				if (flightStatsFallback.delayMinutes && flightStatsFallback.delayMinutes > 0) {
					nextDelayMinutes = flightStatsFallback.delayMinutes;
				}
				if (flightStatsFallback.status && shouldUseStatusFallback(nextStatus, nextDelayMinutes)) {
					nextStatus = preferKnownStatus(
						nextStatus,
						normalizeOperationalStatus(
							flightStatsFallback.status,
							flight.scheduledDeparture,
							flight.flightDate,
							nowMs,
						),
					);
					shouldIncludeStandInfo = shouldUseDepartureStandInfo(
						apiFlight.departure.scheduled,
						flight.flightDate,
						nextStatus,
						nowMs,
					);
				}
				if (shouldIncludeStandInfo && flightStatsFallback.departureGate) {
					nextGate = flightStatsFallback.departureGate;
				}
				if (shouldIncludeStandInfo && flightStatsFallback.departureTerminal) {
					nextTerminal = flightStatsFallback.departureTerminal;
				}
			}

			if (!flightStatsFallbackUsed || shouldUseStatusFallback(nextStatus, nextDelayMinutes)) {
				const fallback = await getFlightAwareFallback(
					[apiFlight.flight.icao, apiFlight.flight.iata, flightNumber],
					flight.origin,
					flight.destination,
					flight.scheduledDeparture,
				);
				if (fallback?.delayMinutes && fallback.delayMinutes > 0) {
					nextDelayMinutes = fallback.delayMinutes;
				}
				if (fallback?.status && shouldUseStatusFallback(nextStatus, nextDelayMinutes)) {
					nextStatus = preferKnownStatus(
						nextStatus,
						normalizeOperationalStatus(
							fallback.status,
							flight.scheduledDeparture,
							flight.flightDate,
							nowMs,
						),
					);
					shouldIncludeStandInfo = shouldUseDepartureStandInfo(
						apiFlight.departure.scheduled,
						flight.flightDate,
						nextStatus,
						nowMs,
					);
				}
				if (shouldIncludeStandInfo && fallback?.departureGate) {
					nextGate = fallback.departureGate;
				}
				if (shouldIncludeStandInfo && fallback?.departureTerminal) {
					nextTerminal = fallback.departureTerminal;
				}
			}
		}

		const finalStatus = preferKnownStatus(flight.currentStatus || undefined, nextStatus);
		const normalizedFinalStatus = normalizeOperationalStatus(
			finalStatus,
			flight.scheduledDeparture,
			flight.flightDate,
			nowMs,
		);
		const isTerminalStatus = isTerminalFlightStatus(normalizedFinalStatus);

		const changes: { field: string; from: string; to: string }[] = [];

		if (flight.currentStatus !== normalizedFinalStatus && normalizedFinalStatus) {
			changes.push({
				field: "Status",
				from: flight.currentStatus || "N/A",
				to: normalizedFinalStatus,
			});
			await db.insert(statusChanges).values({
				flightId,
				oldStatus: flight.currentStatus,
				newStatus: normalizedFinalStatus,
			});
		}

		if (flight.gate !== nextGate && nextGate) {
			changes.push({
				field: "Gate",
				from: flight.gate || "N/A",
				to: nextGate,
			});
		}

		if (flight.terminal !== nextTerminal && nextTerminal) {
			changes.push({
				field: "Terminal",
				from: flight.terminal || "N/A",
				to: nextTerminal,
			});
		}

		if (flight.delayMinutes !== nextDelayMinutes && nextDelayMinutes && nextDelayMinutes > 0) {
			changes.push({
				field: "Delay",
				from: `${flight.delayMinutes || 0} min`,
				to: `${nextDelayMinutes} min`,
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
				currentStatus: normalizedFinalStatus,
				gate: nextGate,
				terminal: nextTerminal,
				delayMinutes: nextDelayMinutes,
				isActive: !isTerminalStatus,
				lastPolledAt: Math.floor(Date.now() / 1000),
			})
			.where(eq(flights.id, flightId));

		logger.info(`✓ Updated flight ${flightNumber}`);
	} catch (error) {
		logger.error(`Error polling flight ${flightNumber}:`, error);
	}
}
