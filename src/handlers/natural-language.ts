import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import { aviationstackApi } from "../services/aviationstack.js";
import { handleApiError } from "../utils/api-error-handler.js";
import { parseFlightInput } from "../utils/flight-parser.js";
import { formatFlightListMessage } from "../utils/format-flight-list.js";
import { logger } from "../utils/logger.js";
import {
	clearPendingSelection,
	getPendingSelection,
	setPendingSelection,
} from "../utils/pending-selections.js";
import { saveAndConfirmFlight } from "./track.js";

const SELECTION_EXPIRED_MESSAGE =
	"❓ Selection expired or invalid.\n\n" +
	"Please search for flights again using: `SFO to LAX today`";

bot.on("message:text", async (ctx: Context) => {
	const message = ctx.message?.text;

	if (!message || message.startsWith("/")) {
		return;
	}

	const parsed = parseFlightInput(message);

	if (parsed.isRoute && parsed.origin && parsed.destination) {
		const date = parsed.date || new Date().toISOString().split("T")[0];

		await ctx.reply(
			`🔍 Looking up flights from ${parsed.origin} to ${parsed.destination} on ${date}...`,
		);

		try {
			const flights = await aviationstackApi.getFlightsByRoute(
				parsed.origin,
				parsed.destination,
				date,
			);

			if (flights.length === 0) {
				await ctx.reply(
					"❌ *No flights found*\n\n" +
						`Could not find any flights from ${parsed.origin} to ${parsed.destination} on ${date}.\n\n` +
						"Please check:\n" +
						"• Airport codes are correct (3-letter IATA codes)\n" +
						"• Date is correct\n" +
						"• Flights are scheduled for that date",
					{ parse_mode: "Markdown" },
				);
				return;
			}

			const chatId = ctx.chat?.id.toString();
			if (!chatId) {
				await ctx.reply("❌ Could not identify chat");
				return;
			}

			const limitedFlights = flights.slice(0, 5);
			const flightList = formatFlightListMessage(limitedFlights);

			await ctx.reply(flightList, { parse_mode: "Markdown" });

			setPendingSelection(chatId, limitedFlights, date);
		} catch (error) {
			logger.error("Error looking up flights:", error);
			await handleApiError(ctx, error);
		}
		return;
	}

	const chatId = ctx.chat?.id.toString();
	if (!chatId) {
		return;
	}

	const pendingSelection = getPendingSelection(chatId);

	if (pendingSelection) {
		const selectionNumber = parseInt(message.trim(), 10);
		const isValidSelection =
			!Number.isNaN(selectionNumber) && selectionNumber >= 1 && selectionNumber <= 5;

		if (!isValidSelection) {
			clearPendingSelection(chatId);
			await ctx.reply(SELECTION_EXPIRED_MESSAGE, { parse_mode: "Markdown" });
			return;
		}

		const selectedIndex = selectionNumber - 1;
		const selectedFlight = pendingSelection.flights[selectedIndex];

		if (selectedFlight) {
			clearPendingSelection(chatId);

			try {
				await saveAndConfirmFlight(ctx, chatId, selectedFlight, pendingSelection.requestedDate);
			} catch (error) {
				logger.error("Error tracking flight:", error);
				await handleApiError(ctx, error);
			}
			return;
		}

		clearPendingSelection(chatId);
		await ctx.reply(SELECTION_EXPIRED_MESSAGE, { parse_mode: "Markdown" });
		return;
	}

	if (parsed.flightNumber && parsed.date) {
		await ctx.reply("🔍 Looking up flight...");

		try {
			const apiFlights = await aviationstackApi.getFlightsByNumber(
				parsed.flightNumber,
				parsed.date,
			);

			if (apiFlights.length === 0) {
				await ctx.reply(
					"❌ *Flight not found*\n\n" +
						`Could not find flight ${parsed.flightNumber} on ${parsed.date}.`,
					{ parse_mode: "Markdown" },
				);
				return;
			}

			if (apiFlights.length > 1) {
				const limitedFlights = apiFlights.slice(0, 5);
				const message = formatFlightListMessage(limitedFlights, parsed.flightNumber);
				await ctx.reply(message, { parse_mode: "Markdown" });
				setPendingSelection(chatId, limitedFlights, parsed.date);
				return;
			}

			await saveAndConfirmFlight(ctx, chatId, apiFlights[0], parsed.date);
		} catch (error) {
			logger.error("Error tracking flight:", error);
			await handleApiError(ctx, error);
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
