import { and, asc, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { bot } from "../bot/index.js";
import { db } from "../db/index.js";
import { flights, trackedFlights } from "../db/schema.js";

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
			const departureTime = new Date(flight.scheduledDeparture);

			message += `${i + 1}. *${flight.flightNumber}*\n`;
			message += `   ${flight.origin} → ${flight.destination}\n`;
			message += `   📅 ${flight.flightDate}\n`;
			message += `   🛫 ${departureTime.toLocaleTimeString("en-US", {
				hour: "2-digit",
				minute: "2-digit",
			})}\n`;
			if (flight.currentStatus) {
				message += `   📊 ${flight.currentStatus}\n`;
			}
			message += "\n";
		}

		message += "Use /status <flight_number> for detailed information";

		await ctx.reply(message, { parse_mode: "Markdown" });
	} catch (error) {
		console.error("Error listing flights:", error);
		await ctx.reply(
			"❌ Failed to retrieve your flights. Please try again later.",
		);
	}
});
