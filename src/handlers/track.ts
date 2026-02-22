import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import type { AviationstackFlight } from "../services/aviationstack.js";
import { aviationstackApi } from "../services/aviationstack.js";
import {
	convertAviationstackFlight,
	createFlight,
	getFlightByNumberAndDate,
	trackFlight,
	updateFlightById,
} from "../services/flight-service.js";
import { handleApiError } from "../utils/api-error-handler.js";
import { parseDate } from "../utils/flight-parser.js";
import { formatFlightListMessage } from "../utils/format-flight-list.js";
import { formatTime } from "../utils/format-time.js";
import { logger } from "../utils/logger.js";
import { setPendingSelection } from "../utils/pending-selections.js";

bot.command("track", async (ctx: Context) => {
	const args = ctx.match?.toString().trim().split(/\s+/);

	if (!args || args.length < 2) {
		await ctx.reply(
			"❌ *Invalid format*\n\n" +
				"Usage: `/track <flight_number> <date>`\n\n" +
				"Example: `/track AA123 2026-03-15`",
			{ parse_mode: "Markdown" },
		);
		return;
	}

	const flightNumber = args[0].toUpperCase();
	const date = parseDate(args.slice(1).join(" ")) ?? args[1];

	const chatId = ctx.chat?.id.toString();
	if (!chatId) {
		await ctx.reply("❌ Could not identify chat");
		return;
	}

	try {
		await ctx.reply("🔍 Looking up flight...");

		const apiFlights = await aviationstackApi.getFlightsByNumber(flightNumber, date);

		if (apiFlights.length === 0) {
			await ctx.reply(
				"❌ *Flight not found*\n\n" +
					`Could not find flight ${flightNumber} on ${date}.\n\n` +
					"Please check:\n" +
					"• Flight number is correct\n" +
					"• Date is in YYYY-MM-DD format\n" +
					"• Flight is scheduled for that date",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		if (apiFlights.length > 1) {
			const limitedFlights = apiFlights.slice(0, 5);
			const message = formatFlightListMessage(limitedFlights, flightNumber);

			await ctx.reply(message, { parse_mode: "Markdown" });
			setPendingSelection(chatId, limitedFlights, date);
			return;
		}

		await saveAndConfirmFlight(ctx, chatId, apiFlights[0], date);
	} catch (error) {
		logger.error("Error tracking flight:", error);
		await handleApiError(ctx, error);
	}
});

export async function saveAndConfirmFlight(
	ctx: Context,
	chatId: string,
	apiFlight: AviationstackFlight,
	requestedDate?: string,
): Promise<void> {
	const flightInput = convertAviationstackFlight(apiFlight, requestedDate);

	const existingFlight = await getFlightByNumberAndDate(
		flightInput.flightNumber,
		flightInput.flightDate,
	);

	let flightId: number;

	if (existingFlight) {
		flightId = existingFlight.id;
		await updateFlightById(flightId, flightInput);
	} else {
		const createdId = await createFlight(flightInput);
		if (!createdId) {
			await ctx.reply("❌ Failed to save flight to database");
			return;
		}
		flightId = createdId;
	}

	const insertedTracking = await trackFlight(chatId, flightId);
	const trackingNote = insertedTracking ? "" : "ℹ️ You were already tracking this flight.\n\n";

	await ctx.reply(
		`${trackingNote}✅ *Flight Tracked Successfully*\n\n` +
			`✈️ ${flightInput.flightNumber}\n` +
			`${apiFlight.airline.name}\n\n` +
			`📍 Route: ${flightInput.origin} → ${flightInput.destination}\n` +
			`📅 Date: ${flightInput.flightDate}\n\n` +
			`🛫 Departure: ${formatTime(apiFlight.departure.scheduled)} (${flightInput.origin})\n` +
			`🛬 Arrival: ${formatTime(apiFlight.arrival.scheduled)} (${flightInput.destination})\n\n` +
			`📊 Status: ${flightInput.currentStatus || "unknown"}\n` +
			`${flightInput.gate ? `🚪 Gate: ${flightInput.gate}\n` : ""}` +
			`${flightInput.terminal ? `🏢 Terminal: ${flightInput.terminal}\n` : ""}`,
		{ parse_mode: "Markdown" },
	);
}
