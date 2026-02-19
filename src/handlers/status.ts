import { and, desc, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { bot } from "../bot/index.js";
import { db } from "../db/index.js";
import { flights, statusChanges, trackedFlights } from "../db/schema.js";

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

		const flight = userTrackings[0].flight;

		const changes = await db
			.select()
			.from(statusChanges)
			.where(eq(statusChanges.flightId, flight.id))
			.orderBy(desc(statusChanges.detectedAt))
			.limit(10);

		let message = `✈️ *${flight.flightNumber}*\n\n`;
		message += `📍 ${flight.origin} → ${flight.destination}\n`;
		message += `📅 ${flight.flightDate}\n\n`;

		const scheduledDeparture = new Date(flight.scheduledDeparture);
		const scheduledArrival = new Date(flight.scheduledArrival);

		message += "*Departure:*\n";
		message += `   Scheduled: ${scheduledDeparture.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		})}\n`;

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
		message += `   Scheduled: ${scheduledArrival.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		})}\n\n`;

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

		await ctx.reply(message, { parse_mode: "Markdown" });
	} catch (error) {
		console.error("Error showing flight status:", error);
		await ctx.reply(
			"❌ Failed to retrieve flight status. Please try again later.",
		);
	}
});
