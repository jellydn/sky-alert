import { and, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { bot } from "../bot/index.js";
import { db } from "../db/index.js";
import { flights, trackedFlights } from "../db/schema.js";

bot.command("remove", async (ctx: Context) => {
	const args = ctx.match?.toString().trim();

	if (!args) {
		await ctx.reply(
			"❌ *Missing flight number*\n\n" +
				"Usage: `/remove <flight_number>`\n\n" +
				"Example: `/remove AA123`",
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
				flightId: flights.id,
				flightNumber: flights.flightNumber,
				flightDate: flights.flightDate,
				origin: flights.origin,
				destination: flights.destination,
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

		const tracking = userTrackings[0];

		await db
			.delete(trackedFlights)
			.where(
				and(
					eq(trackedFlights.chatId, chatId),
					eq(trackedFlights.flightId, tracking.flightId),
				),
			);

		const otherTrackers = await db.query.trackedFlights.findMany({
			where: eq(trackedFlights.flightId, tracking.flightId),
		});

		if (otherTrackers.length === 0) {
			await db
				.update(flights)
				.set({ isActive: false })
				.where(eq(flights.id, tracking.flightId));
		}

		await ctx.reply(
			"✅ *Flight Removed*\n\n" +
				`✈️ ${tracking.flightNumber}\n` +
				`📍 ${tracking.origin} → ${tracking.destination}\n` +
				`📅 ${tracking.flightDate}\n\n` +
				`You are no longer tracking this flight.`,
			{ parse_mode: "Markdown" },
		);
	} catch (error) {
		console.error("Error removing flight:", error);
		await ctx.reply("❌ Failed to remove flight. Please try again later.");
	}
});
