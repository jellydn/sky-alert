import type { Context } from "grammy";
import { bot } from "../bot/instance.js";
import { AviationstackAPI } from "../services/aviationstack.js";
import {
	convertAviationstackFlight,
	createFlight,
	getFlightByNumberAndDate,
	trackFlight,
} from "../services/flight-service.js";
import { parseFlightInput } from "../utils/flight-parser.js";
import {
	clearPendingSelection,
	getPendingSelection,
	setPendingSelection,
} from "../utils/pending-selections.js";

const api = new AviationstackAPI();

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
			const flights = await api.getFlightsByRoute(
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

			let flightList = `✈️ *Found ${limitedFlights.length} flight(s)*\n\n`;
			limitedFlights.forEach((flight, index) => {
				const departureTime = new Date(flight.departure.scheduled);
				flightList += `${index + 1}. *${flight.flight.iata}*\n`;
				flightList += `   ${flight.airline.name}\n`;
				flightList += `   ${departureTime.toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
				})}\n\n`;
			});

			flightList += "Reply with the number (1-5) to track a flight.";

			await ctx.reply(flightList, { parse_mode: "Markdown" });

			setPendingSelection(chatId, limitedFlights);
		} catch (error) {
			if (error instanceof Error) {
				if (error.message === "Rate limit exceeded") {
					await ctx.reply(
						"⚠️ *Rate limit exceeded*\n\n" + "Please try again later.",
						{ parse_mode: "Markdown" },
					);
					return;
				}
				console.error("Error looking up flights:", error);
				await ctx.reply(
					"❌ Failed to look up flights. Please try again later.",
				);
			}
		}
		return;
	}

	const chatId = ctx.chat?.id.toString();
	if (!chatId) {
		return;
	}

	const pendingSelection = getPendingSelection(chatId);

	if (pendingSelection) {
		const selection = message.trim();

		const selectionNumber = parseInt(selection);

		if (
			!isNaN(selectionNumber) &&
			selectionNumber >= 1 &&
			selectionNumber <= 5
		) {
			const selectedIndex = selectionNumber - 1;
			const selectedFlight = pendingSelection.flights[selectedIndex];

			if (selectedFlight) {
				clearPendingSelection(chatId);

				await ctx.reply("🔍 Looking up flight details...");

				try {
					const flightInput = convertAviationstackFlight(selectedFlight);
					const existingFlight = await getFlightByNumberAndDate(
						flightInput.flightNumber,
						flightInput.flightDate,
					);

					let flightId: number;

					if (existingFlight) {
						flightId = existingFlight.id;
						await ctx.reply(
							"ℹ️ Flight already in database, tracking it for you...",
						);
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

					const departureTime = new Date(selectedFlight.departure.scheduled);
					const arrivalTime = new Date(selectedFlight.arrival.scheduled);

					await ctx.reply(
						"✅ *Flight Tracked Successfully*\n\n" +
							`✈️ ${flightInput.flightNumber}\n` +
							`${selectedFlight.airline.name}\n\n` +
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
							`📊 Status: ${selectedFlight.flight_status}`,
						{ parse_mode: "Markdown" },
					);
				} catch (error) {
					if (error instanceof Error) {
						console.error("Error tracking flight:", error);
						await ctx.reply(
							"❌ Failed to track flight. Please try again later.",
						);
					}
				}
				return;
			}
		}

		clearPendingSelection(chatId);
		await ctx.reply(
			"❓ Selection expired or invalid.\n\n" +
				"Please search for flights again using: `SFO to LAX today`",
			{ parse_mode: "Markdown" },
		);
		return;
	}

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
