import { asc, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { flights, trackedFlights } from "../db/schema.js";
import { formatTime } from "../utils/format-time.js";
import { logger } from "../utils/logger.js";

bot.command("flights", async (ctx: Context) => {
	const chatId = ctx.chat?.id.toString();

	if (!chatId) {
		await ctx.reply("❌ Could not identify chat");
		return;
	}

	try {
		const userTrackings = await db
			.select({
				id: flights.id,
				flightNumber: flights.flightNumber,
				flightDate: flights.flightDate,
				origin: flights.origin,
				destination: flights.destination,
				scheduledDeparture: flights.scheduledDeparture,
				currentStatus: flights.currentStatus,
			})
			.from(trackedFlights)
			.innerJoin(flights, eq(trackedFlights.flightId, flights.id))
			.where(eq(trackedFlights.chatId, chatId))
			.orderBy(asc(flights.flightDate), asc(flights.scheduledDeparture));

		if (userTrackings.length === 0) {
			await ctx.reply(
				"📭 *No flights tracked*\n\n" +
					"You are not currently tracking any flights.\n\n" +
					"*To track a flight, use one of these:*\n" +
					"• `/track AA123 2026-03-15`\n" +
					"• `AA123 tomorrow`\n" +
					"• `SFO to LAX today`",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		let message = `✈️ *Your tracked flights (${userTrackings.length})*\n\n`;

		for (let i = 0; i < userTrackings.length; i++) {
			const flight = userTrackings[i];

			message += `${i + 1}. *${flight.flightNumber}*\n`;
			message += `   ${flight.origin} → ${flight.destination}\n`;
			message += `   📅 ${flight.flightDate}\n`;
			message += `   🛫 ${formatTime(flight.scheduledDeparture)} (${flight.origin})\n`;
			if (flight.currentStatus) {
				message += `   📊 ${flight.currentStatus}\n`;
			}
			message += "\n";
		}

		message += "Use `/status` followed by a flight number for details";

		await ctx.reply(message, { parse_mode: "Markdown" });
	} catch (error) {
		logger.error("Error listing flights:", error);
		await ctx.reply(
			"❌ Failed to retrieve your flights. Please try again later.",
		);
	}
});
