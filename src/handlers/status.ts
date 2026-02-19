import { and, desc, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { flights, statusChanges, trackedFlights } from "../db/schema.js";
import { canMakeRequest } from "../services/api-budget.js";
import { AviationstackAPI } from "../services/aviationstack.js";
import { formatDateTime } from "../utils/format-time.js";
import { logger } from "../utils/logger.js";

const api = new AviationstackAPI();
const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

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
		const userTrackings = await db
			.select({
				flight: flights,
			})
			.from(trackedFlights)
			.innerJoin(flights, eq(trackedFlights.flightId, flights.id))
			.where(
				and(
					eq(trackedFlights.chatId, chatId),
					eq(flights.flightNumber, flightNumber),
				),
			);

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

		const lastPolled = flight.lastPolledAt ? flight.lastPolledAt * 1000 : 0;
		const isStale = Date.now() - lastPolled > STALE_THRESHOLD;
		const isFlightActive =
			flight.currentStatus !== "landed" && flight.currentStatus !== "cancelled";
		const canRefresh = await canMakeRequest();
		const shouldRefresh = isStale && isFlightActive && canRefresh;

		if (shouldRefresh) {
			try {
				const apiFlights = await api.getFlightsByNumber(
					flight.flightNumber,
					flight.flightDate,
				);
				if (apiFlights.length > 0) {
					const apiFlight = apiFlights[0];
					const oldStatus = flight.currentStatus;
					const newStatus = apiFlight.flight_status;

					if (oldStatus !== newStatus) {
						await db.insert(statusChanges).values({
							flightId: flight.id,
							oldStatus,
							newStatus,
						});
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
						.where(eq(flights.id, flight.id));

					const updated = await db.query.flights.findFirst({
						where: eq(flights.id, flight.id),
					});
					if (updated) flight = updated;
				}
			} catch {
				// Silently fall back to cached data
			}
		}

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
		message += `   Scheduled: ${formatDateTime(flight.scheduledDeparture)} (${flight.origin})\n`;

		if (flight.currentStatus) {
			message += `   Status: ${flight.currentStatus}\n`;
		}

		if (flight.gate) {
			message += `   🚪 Gate: ${flight.gate}\n`;
		}

		if (flight.terminal) {
			message += `   🏢 Terminal: ${flight.terminal}\n`;
		}

		if (flight.delayMinutes && flight.delayMinutes > 0) {
			message += `   ⏱️ Delay: ${flight.delayMinutes} min\n`;
		}

		message += "\n";

		message += "*Arrival:*\n";
		message += `   Scheduled: ${formatDateTime(flight.scheduledArrival)} (${flight.destination})\n\n`;

		if (changes.length > 0) {
			message += "*Recent Status Changes:*\n";
			for (let i = 0; i < changes.length; i++) {
				const change = changes[i];
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

		await ctx.reply(message, { parse_mode: "Markdown" });
	} catch (error) {
		logger.error("Error showing flight status:", error);
		await ctx.reply(
			"❌ Failed to retrieve flight status. Please try again later.",
		);
	}
});
