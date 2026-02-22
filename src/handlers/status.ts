import { and, desc, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { flights, statusChanges, trackedFlights } from "../db/schema.js";
import { canMakeRequest } from "../services/api-budget.js";
import { aviationstackApi } from "../services/aviationstack.js";
import { getDelayMinutes, selectBestMatchingFlight } from "../services/flight-service.js";
import { getFlightAwareFallback } from "../services/flightaware-fallback.js";
import { getFlightStatsFallback } from "../services/flightstats-fallback.js";
import {
	isTerminalFlightStatus,
	normalizeOperationalStatus,
	preferKnownStatus,
	shouldUseDepartureStandInfo,
	shouldUseStatusFallback,
} from "../utils/flight-status.js";
import { formatDateTime, formatDateTimeForFlightDate } from "../utils/format-time.js";
import { logger } from "../utils/logger.js";

const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

function addMinutesToIso(isoString: string, minutes: number): string | undefined {
	const baseTimeMs = Date.parse(isoString);
	if (Number.isNaN(baseTimeMs)) {
		return undefined;
	}

	return new Date(baseTimeMs + minutes * 60 * 1000).toISOString();
}

function parseCarrierAndNumber(flightCode: string): { carrier?: string; number?: string } {
	const match = flightCode.match(/^([A-Z]{2,3})(\d{1,4})$/);
	if (!match) {
		return {};
	}

	return { carrier: match[1], number: match[2] };
}

bot.command("status", async (ctx: Context) => {
	const args = ctx.match?.toString().trim();

	if (!args) {
		await ctx.reply(
			"❌ *Missing flight number*\n\n" +
				"Usage: `/status <flight_number>`\n\n" +
				"Example: `/status AA123`",
			{ parse_mode: "Markdown" },
		);
		return;
	}

	const flightNumber = args.toUpperCase();
	const chatId = ctx.chat?.id.toString();

	if (!chatId) {
		await ctx.reply("❌ Could not identify chat");
		return;
	}

	try {
		let refreshFailed = false;
		let liveEstimatedDeparture: string | undefined;
		let liveEstimatedArrival: string | undefined;
		let liveArrivalGate: string | undefined;
		let liveArrivalTerminal: string | undefined;

		const userTrackings = await db
			.select({
				flight: flights,
			})
			.from(trackedFlights)
			.innerJoin(flights, eq(trackedFlights.flightId, flights.id))
			.where(and(eq(trackedFlights.chatId, chatId), eq(flights.flightNumber, flightNumber)));

		if (userTrackings.length === 0) {
			await ctx.reply(
				"❌ *Flight not found in your tracked flights*\n\n" +
					`You are not tracking flight ${flightNumber}.\n\n` +
					"Use `/flights` to see all your tracked flights.",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		let flight = userTrackings[0].flight;
		let displayStatus = flight.currentStatus || "";
		let displayDelayMinutes = flight.delayMinutes || undefined;
		let displayDepartureGate = flight.gate || undefined;
		let displayDepartureTerminal = flight.terminal || undefined;

		const lastPolled = flight.lastPolledAt ? flight.lastPolledAt * 1000 : 0;
		const isStale = Date.now() - lastPolled >= STALE_THRESHOLD;
		const isFlightActive = !isTerminalFlightStatus(flight.currentStatus || undefined);
		const hasLowSignalStatus = shouldUseStatusFallback(
			flight.currentStatus || "",
			flight.delayMinutes || undefined,
		);
		const canRefresh = await canMakeRequest();
		const shouldRefresh = isFlightActive && canRefresh && (isStale || hasLowSignalStatus);

		if (shouldRefresh) {
			try {
				const apiFlights = await aviationstackApi.getFlightsByNumber(
					flight.flightNumber,
					flight.flightDate,
					{ bypassCache: true },
				);
				if (apiFlights.length > 0) {
					const apiFlight = selectBestMatchingFlight(apiFlights, flight.origin, flight.destination);
					if (!apiFlight) {
						throw new Error("No matching API flight found");
					}
					let nextDelayMinutes = getDelayMinutes(apiFlight);
					let newStatus = preferKnownStatus(
						flight.currentStatus || undefined,
						normalizeOperationalStatus(
							apiFlight.flight_status,
							apiFlight.departure.scheduled,
							flight.flightDate,
							Date.now(),
							apiFlight.flight_date,
						),
					);
					const shouldIncludeStandInfo = shouldUseDepartureStandInfo(
						apiFlight.departure.scheduled,
						flight.flightDate,
						newStatus,
					);
					let nextGate = shouldIncludeStandInfo ? apiFlight.departure.gate || undefined : undefined;
					let nextTerminal = shouldIncludeStandInfo
						? apiFlight.departure.terminal || undefined
						: undefined;
					let flightStatsFallbackUsed = false;

					if (shouldUseStatusFallback(newStatus, nextDelayMinutes)) {
						const parsedCode = parseCarrierAndNumber(flight.flightNumber);
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
							if (
								flightStatsFallback.status &&
								shouldUseStatusFallback(newStatus, nextDelayMinutes)
							) {
								newStatus = preferKnownStatus(
									newStatus,
									normalizeOperationalStatus(
										flightStatsFallback.status,
										flight.scheduledDeparture,
										flight.flightDate,
									),
								);
							}
							if (shouldIncludeStandInfo && flightStatsFallback.departureGate) {
								nextGate = flightStatsFallback.departureGate;
							}
							if (shouldIncludeStandInfo && flightStatsFallback.departureTerminal) {
								nextTerminal = flightStatsFallback.departureTerminal;
							}
							liveEstimatedDeparture = flightStatsFallback.estimatedDeparture;
							liveEstimatedArrival = flightStatsFallback.estimatedArrival;
							liveArrivalGate = flightStatsFallback.arrivalGate;
							liveArrivalTerminal = flightStatsFallback.arrivalTerminal;
						}

						if (!flightStatsFallbackUsed || shouldUseStatusFallback(newStatus, nextDelayMinutes)) {
							const fallback = await getFlightAwareFallback(
								[apiFlight.flight.icao, apiFlight.flight.iata, flight.flightNumber],
								flight.origin,
								flight.destination,
							);
							if (fallback?.delayMinutes && fallback.delayMinutes > 0) {
								nextDelayMinutes = fallback.delayMinutes;
							}
							if (fallback?.status && shouldUseStatusFallback(newStatus, nextDelayMinutes)) {
								newStatus = preferKnownStatus(
									newStatus,
									normalizeOperationalStatus(
										fallback.status,
										flight.scheduledDeparture,
										flight.flightDate,
									),
								);
							}
						}
					}
					const oldStatus = flight.currentStatus;
					const finalStatus = normalizeOperationalStatus(
						preferKnownStatus(oldStatus || undefined, newStatus),
						flight.scheduledDeparture,
						flight.flightDate,
					);
					const isTerminalStatus = isTerminalFlightStatus(finalStatus);

					if (oldStatus !== finalStatus && finalStatus) {
						await db.insert(statusChanges).values({
							flightId: flight.id,
							oldStatus,
							newStatus: finalStatus,
						});
					}

					await db
						.update(flights)
						.set({
							currentStatus: finalStatus,
							gate: nextGate,
							terminal: nextTerminal,
							delayMinutes: nextDelayMinutes,
							isActive: !isTerminalStatus,
							lastPolledAt: Math.floor(Date.now() / 1000),
						})
						.where(eq(flights.id, flight.id));

					const updated = await db.query.flights.findFirst({
						where: eq(flights.id, flight.id),
					});
					if (updated) flight = updated;
					displayStatus = finalStatus || displayStatus;
					displayDelayMinutes = nextDelayMinutes || undefined;
					displayDepartureGate = nextGate;
					displayDepartureTerminal = nextTerminal;
				}
			} catch (error) {
				refreshFailed = true;
				logger.warn(`Live refresh failed for ${flight.flightNumber}:`, error);
			}
		}

		const shouldEnrichFromFallback = !isTerminalFlightStatus(
			flight.currentStatus || displayStatus || undefined,
		);
		const shouldIncludeStandInfo = shouldUseDepartureStandInfo(
			flight.scheduledDeparture,
			flight.flightDate,
			displayStatus,
		);
		if (shouldEnrichFromFallback) {
			const parsedCode = parseCarrierAndNumber(flight.flightNumber);
			if (parsedCode.carrier && parsedCode.number) {
				try {
					const flightStatsFallback = await getFlightStatsFallback(
						parsedCode.carrier,
						parsedCode.number,
					);
					if (flightStatsFallback?.status) {
						displayStatus =
							preferKnownStatus(
								displayStatus,
								normalizeOperationalStatus(
									flightStatsFallback.status,
									flight.scheduledDeparture,
									flight.flightDate,
								),
							) || "";
					}
					if (flightStatsFallback?.delayMinutes && flightStatsFallback.delayMinutes > 0) {
						displayDelayMinutes = flightStatsFallback.delayMinutes;
					}
					if (shouldIncludeStandInfo && flightStatsFallback?.departureGate) {
						displayDepartureGate = flightStatsFallback.departureGate;
					}
					if (shouldIncludeStandInfo && flightStatsFallback?.departureTerminal) {
						displayDepartureTerminal = flightStatsFallback.departureTerminal;
					}
					if (flightStatsFallback?.estimatedDeparture) {
						liveEstimatedDeparture = flightStatsFallback.estimatedDeparture;
					}
					if (flightStatsFallback?.estimatedArrival) {
						liveEstimatedArrival = flightStatsFallback.estimatedArrival;
					}
					if (flightStatsFallback?.arrivalGate) {
						liveArrivalGate = flightStatsFallback.arrivalGate;
					}
					if (flightStatsFallback?.arrivalTerminal) {
						liveArrivalTerminal = flightStatsFallback.arrivalTerminal;
					}
				} catch (error) {
					logger.debug(`FlightStats display enrichment failed for ${flight.flightNumber}:`, error);
				}
			}
		}

		const finalDisplayStatus = normalizeOperationalStatus(
			preferKnownStatus(flight.currentStatus || undefined, displayStatus || undefined),
			flight.scheduledDeparture,
			flight.flightDate,
		);
		if (finalDisplayStatus && finalDisplayStatus !== (flight.currentStatus || undefined)) {
			await db.insert(statusChanges).values({
				flightId: flight.id,
				oldStatus: flight.currentStatus,
				newStatus: finalDisplayStatus,
			});

			await db
				.update(flights)
				.set({
					currentStatus: finalDisplayStatus,
					isActive: !isTerminalFlightStatus(finalDisplayStatus),
				})
				.where(eq(flights.id, flight.id));

			const updated = await db.query.flights.findFirst({
				where: eq(flights.id, flight.id),
			});
			if (updated) {
				flight = updated;
			}
		}
		displayStatus = finalDisplayStatus || displayStatus;

		const changes = await db
			.select()
			.from(statusChanges)
			.where(eq(statusChanges.flightId, flight.id))
			.orderBy(desc(statusChanges.detectedAt))
			.limit(10);

		let message = `✈️ *${flight.flightNumber}*\n\n`;
		message += `📍 ${flight.origin} → ${flight.destination}\n`;
		message += `📅 ${flight.flightDate}\n\n`;

		message += "*Departure:*\n";
		message += `   Scheduled: ${formatDateTimeForFlightDate(
			flight.scheduledDeparture,
			flight.flightDate,
		)} (${flight.origin})\n`;
		if (liveEstimatedDeparture) {
			message += `   Estimated: ${formatDateTime(liveEstimatedDeparture)} (${flight.origin})\n`;
		} else if (displayDelayMinutes && displayDelayMinutes > 0) {
			const estimatedDeparture = addMinutesToIso(flight.scheduledDeparture, displayDelayMinutes);
			if (estimatedDeparture) {
				message += `   Estimated: ${formatDateTime(estimatedDeparture)} (${flight.origin})\n`;
			}
		}

		if (displayStatus) {
			message += `   Status: ${displayStatus}\n`;
		}

		if (displayDepartureGate) {
			message += `   🚪 Gate: ${displayDepartureGate}\n`;
		}

		if (displayDepartureTerminal) {
			message += `   🏢 Terminal: ${displayDepartureTerminal}\n`;
		}

		if (!displayDepartureGate && !displayDepartureTerminal && displayStatus === "scheduled") {
			message += "   ℹ️ Gate/terminal not available yet\n";
		}

		if (displayDelayMinutes && displayDelayMinutes > 0) {
			message += `   ⏱️ Delay: ${displayDelayMinutes} min\n`;
		}

		message += "\n";

		message += "*Arrival:*\n";
		message += `   Scheduled: ${formatDateTimeForFlightDate(
			flight.scheduledArrival,
			flight.flightDate,
		)} (${flight.destination})\n`;
		if (liveEstimatedArrival) {
			message += `   Estimated: ${formatDateTime(liveEstimatedArrival)} (${flight.destination})\n`;
		} else if (displayDelayMinutes && displayDelayMinutes > 0) {
			const estimatedArrival = addMinutesToIso(flight.scheduledArrival, displayDelayMinutes);
			if (estimatedArrival) {
				message += `   Estimated: ${formatDateTime(estimatedArrival)} (${flight.destination})\n`;
			}
		}
		if (liveArrivalGate) {
			message += `   🚪 Gate: ${liveArrivalGate}\n`;
		}
		if (liveArrivalTerminal) {
			message += `   🏢 Terminal: ${liveArrivalTerminal}\n`;
		}
		message += "\n";

		const displayChanges = changes.filter((change) => {
			const normalizedNewStatus = normalizeOperationalStatus(
				change.newStatus,
				flight.scheduledDeparture,
				flight.flightDate,
			);
			return normalizedNewStatus && normalizedNewStatus === change.newStatus;
		});

		if (displayChanges.length > 0) {
			message += "*Recent Status Changes:*\n";
			for (let i = 0; i < displayChanges.length; i++) {
				const change = displayChanges[i];
				const detectedTime = new Date(change.detectedAt);
				const timeStr = detectedTime.toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
				});

				message += `   ${timeStr}: `;
				if (change.oldStatus) {
					message += `${change.oldStatus} → `;
				}
				message += `${change.newStatus}`;
				if (change.details) {
					message += ` (${change.details})`;
				}
				message += "\n";
			}
		}

		if (flight.lastPolledAt) {
			const ago = Math.round((Date.now() - flight.lastPolledAt * 1000) / 60000);
			message += `\n_Updated ${ago} min ago_`;
		}
		if (refreshFailed) {
			message += "\n_⚠️ Could not refresh live status. Showing latest cached data._";
		}

		await ctx.reply(message, { parse_mode: "Markdown" });
	} catch (error) {
		logger.error("Error showing flight status:", error);
		await ctx.reply("❌ Failed to retrieve flight status. Please try again later.");
	}
});
