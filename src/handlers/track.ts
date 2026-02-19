import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import type { AviationstackFlight } from "../services/aviationstack.js";
import { AviationstackAPI } from "../services/aviationstack.js";
import {
	convertAviationstackFlight,
	createFlight,
	getFlightByNumberAndDate,
	trackFlight,
} from "../services/flight-service.js";
import { parseDate } from "../utils/flight-parser.js";
import { formatTime } from "../utils/format-time.js";
import { logger } from "../utils/logger.js";
import { setPendingSelection } from "../utils/pending-selections.js";

const api = new AviationstackAPI();

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

		const apiFlights = await api.getFlightsByNumber(flightNumber, date);

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

			let message = `✈️ *Found ${limitedFlights.length} flights for ${flightNumber}*\n\n`;
			for (let i = 0; i < limitedFlights.length; i++) {
				const f = limitedFlights[i];
				const depTime = new Date(f.departure.scheduled);
				message += `${i + 1}. ${f.departure.iata} → ${f.arrival.iata}\n`;
				message += `   🛫 ${depTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
				if (f.departure.terminal)
					message += ` Terminal ${f.departure.terminal}`;
				message += `\n   📊 ${f.flight_status}\n\n`;
			}

			message += "Reply with the number (1-5) to track a flight.";

			await ctx.reply(message, { parse_mode: "Markdown" });
			setPendingSelection(chatId, limitedFlights);
			return;
		}

		await saveAndConfirmFlight(ctx, chatId, apiFlights[0]);
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "Monthly API budget exceeded") {
				await ctx.reply(
					"⚠️ *Monthly API budget exceeded*\n\n" +
						"Free tier limit (100 requests/month) reached.\n" +
						"Use `/usage` to check your remaining budget.",
					{ parse_mode: "Markdown" },
				);
				return;
			}

			if (error.message === "Rate limit exceeded") {
				await ctx.reply("⚠️ *Rate limit exceeded*\n\nPlease try again later.", {
					parse_mode: "Markdown",
				});
				return;
			}

			if (error.message === "Invalid API key") {
				await ctx.reply(
					"❌ *Configuration error*\n\n" +
						"Invalid Aviationstack API key. Please contact the administrator.",
					{ parse_mode: "Markdown" },
				);
				return;
			}

			logger.error("Error tracking flight:", error);
			await ctx.reply("❌ Failed to track flight. Please try again later.");
		} else {
			await ctx.reply(
				"❌ An unexpected error occurred. Please try again later.",
			);
		}
	}
});

export async function saveAndConfirmFlight(
	ctx: Context,
	chatId: string,
	apiFlight: AviationstackFlight,
): Promise<void> {
	const flightInput = convertAviationstackFlight(apiFlight);

	const existingFlight = await getFlightByNumberAndDate(
		flightInput.flightNumber,
		flightInput.flightDate,
	);

	let flightId: number;

	if (existingFlight) {
		flightId = existingFlight.id;
	} else {
		const createdId = await createFlight(flightInput);
		if (!createdId) {
			await ctx.reply("❌ Failed to save flight to database");
			return;
		}
		flightId = createdId;
	}

	const alreadyTracking = await trackFlight(chatId, flightId);

	const trackingNote = alreadyTracking
		? "ℹ️ You were already tracking this flight.\n\n"
		: "";

	await ctx.reply(
		`${trackingNote}✅ *Flight Tracked Successfully*\n\n` +
			`✈️ ${flightInput.flightNumber}\n` +
			`${apiFlight.airline.name}\n\n` +
			`📍 Route: ${flightInput.origin} → ${flightInput.destination}\n` +
			`📅 Date: ${flightInput.flightDate}\n\n` +
			`🛫 Departure: ${formatTime(apiFlight.departure.scheduled)} (${flightInput.origin})\n` +
			`🛬 Arrival: ${formatTime(apiFlight.arrival.scheduled)} (${flightInput.destination})\n\n` +
			`📊 Status: ${apiFlight.flight_status}\n` +
			`${apiFlight.departure.gate ? `🚪 Gate: ${apiFlight.departure.gate}\n` : ""}` +
			`${apiFlight.departure.terminal ? `🏢 Terminal: ${apiFlight.departure.terminal}\n` : ""}`,
		{ parse_mode: "Markdown" },
	);
}
