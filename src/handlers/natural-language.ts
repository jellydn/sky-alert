import type { Context } from "grammy";
import { bot } from "../bot/index.js";
import { AviationstackAPI } from "../services/aviationstack.js";
import {
	convertAviationstackFlight,
	createFlight,
	getFlightByNumberAndDate,
	trackFlight,
} from "../services/flight-service.js";
import { parseFlightInput } from "../utils/flight-parser.js";

const api = new AviationstackAPI();

bot.on("message:text", async (ctx: Context) => {
	const message = ctx.message?.text;

	if (!message || message.startsWith("/")) {
		return;
	}

	const parsed = parseFlightInput(message);

	if (parsed.flightNumber && parsed.date) {
		await ctx.reply("🔍 Looking up flight...");

		try {
			const apiFlight = await api.getFlightByNumber(
				parsed.flightNumber,
				parsed.date,
			);

			if (!apiFlight) {
				await ctx.reply(
					"❌ *Flight not found*\n\n" +
						`Could not find flight ${parsed.flightNumber} on ${parsed.date}.`,
					{ parse_mode: "Markdown" },
				);
				return;
			}

			const flightInput = convertAviationstackFlight(apiFlight);
			const existingFlight = await getFlightByNumberAndDate(
				flightInput.flightNumber,
				flightInput.flightDate,
			);

			let flightId: number;
			const chatId = ctx.chat?.id.toString();

			if (!chatId) {
				await ctx.reply("❌ Could not identify chat");
				return;
			}

			if (existingFlight) {
				flightId = existingFlight.id;
				await ctx.reply("ℹ️ Flight already in database, tracking it for you...");
			} else {
				flightId = (await createFlight(flightInput))!;
				if (!flightId) {
					await ctx.reply("❌ Failed to save flight to database");
					return;
				}
			}

			const alreadyTracking = await trackFlight(chatId, flightId);

			if (!alreadyTracking) {
				await ctx.reply("✅ You are now tracking this flight!");
			}

			const departureTime = new Date(apiFlight.departure.scheduled);
			const arrivalTime = new Date(apiFlight.arrival.scheduled);

			await ctx.reply(
				"✅ *Flight Tracked Successfully*\n\n" +
					`✈️ ${flightInput.flightNumber}\n` +
					`${apiFlight.airline.name}\n\n` +
					`📍 Route: ${flightInput.origin} → ${flightInput.destination}\n` +
					`📅 Date: ${flightInput.flightDate}\n\n` +
					`🛫 Departure: ${departureTime.toLocaleTimeString("en-US", {
						hour: "2-digit",
						minute: "2-digit",
					})}\n` +
					`🛬 Arrival: ${arrivalTime.toLocaleTimeString("en-US", {
						hour: "2-digit",
						minute: "2-digit",
					})}\n\n` +
					`📊 Status: ${apiFlight.flight_status}`,
				{ parse_mode: "Markdown" },
			);
		} catch (error) {
			if (error instanceof Error) {
				if (error.message === "Rate limit exceeded") {
					await ctx.reply(
						"⚠️ *Rate limit exceeded*\n\n" + "Please try again later.",
						{ parse_mode: "Markdown" },
					);
					return;
				}
				console.error("Error tracking flight:", error);
				await ctx.reply("❌ Failed to track flight. Please try again later.");
			}
		}
	} else if (parsed.flightNumber && !parsed.date) {
		await ctx.reply(
			`✈️ *Flight: ${parsed.flightNumber}*\n\n` +
				"Please provide the date for this flight.\n\n" +
				"*Supported formats:*\n" +
				"• 2026-03-15\n" +
				"• 15/03/2026\n" +
				"• March 15\n" +
				"• today, tomorrow\n" +
				"• next Monday",
			{ parse_mode: "Markdown" },
		);
	} else {
		await ctx.reply(
			"👋 Hi! I didn't find a flight number in your message.\n\n" +
				"*To track a flight, use one of these formats:*\n\n" +
				"• Flight number with date:\n" +
				"  `AA123 tomorrow`\n" +
				"  `UA456 2026-03-15`\n\n" +
				"• Route:\n" +
				"  `SFO to LAX today`\n\n" +
				"• Or use commands:\n" +
				"  `/track <flight> <date>`\n" +
				"  `/help` for more options",
			{ parse_mode: "Markdown" },
		);
	}
});
