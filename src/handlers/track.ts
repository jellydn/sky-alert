import type { Context } from "grammy";
import { bot } from "../bot/index.js";
import { AviationstackAPI } from "../services/aviationstack.js";
import {
	convertAviationstackFlight,
	createFlight,
	getFlightByNumberAndDate,
	trackFlight,
} from "../services/flight-service.js";

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
	const date = args[1];

	const chatId = ctx.chat?.id.toString();
	if (!chatId) {
		await ctx.reply("❌ Could not identify chat");
		return;
	}

	try {
		await ctx.reply("🔍 Looking up flight...");

		const apiFlight = await api.getFlightByNumber(flightNumber, date);

		if (!apiFlight) {
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

		const flightInput = convertAviationstackFlight(apiFlight);

		const existingFlight = await getFlightByNumberAndDate(
			flightInput.flightNumber,
			flightInput.flightDate,
		);

		let flightId: number;

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
				`📊 Status: ${apiFlight.flight_status}\n` +
				`${apiFlight.departure.gate ? `🚪 Gate: ${apiFlight.departure.gate}\n` : ""}` +
				`${apiFlight.departure.terminal ? `🏢 Terminal: ${apiFlight.departure.terminal}\n` : ""}`,
			{ parse_mode: "Markdown" },
		);
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "Rate limit exceeded") {
				await ctx.reply(
					"⚠️ *Rate limit exceeded*\n\n" +
						"Please try again later.\n" +
						"Aviationstack API has limits on the free tier.",
					{ parse_mode: "Markdown" },
				);
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

			console.error("Error tracking flight:", error);
			await ctx.reply("❌ Failed to track flight. Please try again later.");
		} else {
			await ctx.reply(
				"❌ An unexpected error occurred. Please try again later.",
			);
		}
	}
});
