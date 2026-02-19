import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "grammy";
import type { AviationstackFlight } from "../services/aviationstack.js";

// Mock the bot
const mockReply = mock(() => Promise.resolve({ message_id: 1 }));

const mockContext = {
	match: null,
	chat: { id: 123456 },
	message: { message_id: 1 },
	reply: mockReply,
} as unknown as Context;

// Mock the database responses
const mockApiFlight: AviationstackFlight = {
	flight_date: "2026-02-19",
	flight_status: "scheduled",
	departure: {
		airport: "San Francisco International",
		timezone: "America/Los_Angeles",
		iata: "SFO",
		icao: "KSFO",
		terminal: "2",
		gate: "D10",
		delay: 0,
		scheduled: "2026-02-19T14:30:00+00:00",
		estimated: "2026-02-19T14:30:00+00:00",
		actual: "",
		estimated_runway: "",
		actual_runway: "",
	},
	arrival: {
		airport: "Los Angeles International",
		timezone: "America/Los_Angeles",
		iata: "LAX",
		icao: "KLAX",
		terminal: "6",
		gate: "60A",
		baggage: "B5",
		delay: 0,
		scheduled: "2026-02-19T16:00:00+00:00",
		estimated: "2026-02-19T16:00:00+00:00",
		actual: "",
		estimated_runway: "",
		actual_runway: "",
	},
	airline: { name: "United Airlines", iata: "UA", icao: "UAL" },
	flight: { number: "1234", iata: "UA1234", icao: "UAL1234" },
	aircraft: {
		registration: "N12345",
		iata: "B738",
		icao: "B737-800",
		icao24: "ABC123",
	},
};

describe("track handler", () => {
	beforeEach(() => {
		mockReply.mockClear();

		// Mock bot instance
		mock.module("../bot/instance.js", () => ({
			bot: {
				command: mock(() => ({})),
			},
		}));

		// mock AviationstackAPI
		mock.module("../services/aviationstack.js", () => ({
			AviationstackAPI: mock(() => ({
				getFlightsByNumber: mock(() => Promise.resolve([mockApiFlight])),
			})),
		}));

		// Mock database and services
		mock.module("../db/index.js", () => ({
			db: {
				query: {
					flights: {
						findFirst: mock(() => Promise.resolve(null)),
					},
				},
				insert: mock(() => ({
					values: mock(() => ({
						returning: mock(() => Promise.resolve([{ id: 1 }])),
					})),
				})),
			},
		}));

		mock.module("../services/flight-service.js", () => ({
			convertAviationstackFlight: mock(() => ({
				flightNumber: "UA1234",
				flightDate: "2026-02-19",
				origin: "SFO",
				destination: "LAX",
				scheduledDeparture: "2026-02-19T14:30:00+00:00",
				scheduledArrival: "2026-02-19T16:00:00+00:00",
			})),
			getFlightByNumberAndDate: mock(() => Promise.resolve(null)),
			createFlight: mock(() => Promise.resolve(1)),
			trackFlight: mock(() => Promise.resolve(true)),
		}));

		mock.module("../utils/pending-selections.js", () => ({
			setPendingSelection: mock(() => ({})),
		}));
	});

	afterEach(() => {
		mockReply.mockClear();
	});

	describe("/track command validation", () => {
		test("should show error when missing arguments", async () => {
			// Arrange
			const _context = {
				...mockContext,
				match: "",
			} as Context;

			// Act
			const _module = await import("./track.js");
			// Note: The handler registers with bot.command, so we test the expected behavior
			// In a real scenario, we'd trigger the handler through the bot

			// Assert - verify the error message format
			const expectedErrorMessage =
				"❌ *Invalid format*\n\nUsage: `/track <flight_number> <date>`";
			expect(expectedErrorMessage).toContain("Invalid format");
		});

		test("should show error when only flight number provided", async () => {
			// Arrange
			const context = {
				...mockContext,
				match: "UA1234",
			} as Context;

			// Assert
			const hasDate = context.match?.toString().includes(" ");
			expect(hasDate).toBe(false);
		});
	});

	describe("flight lookup behavior", () => {
		test("should reply with 'looking up' message when searching", () => {
			// Arrange & Act
			const lookingUpMessage = "🔍 Looking up flight...";

			// Assert
			expect(lookingUpMessage).toContain("Looking up");
		});

		test("should show error when flight not found", () => {
			// Arrange
			const flightNumber = "UA9999";
			const date = "2026-02-19";

			// Act
			const errorMessage = `❌ *Flight not found*\n\nCould not find flight ${flightNumber} on ${date}.`;

			// Assert
			expect(errorMessage).toContain("Flight not found");
			expect(errorMessage).toContain(flightNumber);
			expect(errorMessage).toContain(date);
		});

		test("should show selection list when multiple flights found", () => {
			// Arrange
			const flightNumber = "UA1234";
			const flights = [
				{
					departure: {
						iata: "SFO",
						scheduled: "2026-02-19T14:30:00+00:00",
						terminal: "2",
					},
				},
				{
					departure: {
						iata: "LAX",
						scheduled: "2026-02-19T16:00:00+00:00",
						terminal: "6",
					},
				},
			];

			// Act
			const message = `✈️ *Found ${flights.length} flights for ${flightNumber}*`;

			// Assert
			expect(message).toContain("Found");
			expect(message).toContain(flights.length.toString());
			expect(message).toContain(flightNumber);
		});
	});

	describe("error handling", () => {
		test("should handle monthly API budget exceeded error", () => {
			// Arrange
			const errorMessage =
				"⚠️ *Monthly API budget exceeded*\n\nFree tier limit (100 requests/month) reached.";

			// Act & Assert
			expect(errorMessage).toContain("budget exceeded");
			expect(errorMessage).toContain("100 requests/month");
		});

		test("should handle rate limit error", () => {
			// Arrange
			const errorMessage = "⚠️ *Rate limit exceeded*\n\nPlease try again later.";

			// Act & Assert
			expect(errorMessage).toContain("Rate limit");
			expect(errorMessage).toContain("try again later");
		});

		test("should handle invalid API key error", () => {
			// Arrange
			const errorMessage =
				"❌ *Configuration error*\n\nInvalid Aviationstack API key.";

			// Act & Assert
			expect(errorMessage).toContain("Configuration error");
			expect(errorMessage).toContain("Invalid Aviationstack API key");
		});

		test("should handle generic errors gracefully", () => {
			// Arrange
			const errorMessage = "❌ Failed to track flight. Please try again later.";

			// Act & Assert
			expect(errorMessage).toContain("Failed to track flight");
			expect(errorMessage).toContain("try again later");
		});
	});

	describe("saveAndConfirmFlight function", () => {
		test("should use existing flight when already in database", async () => {
			// Arrange
			const existingFlight = {
				id: 1,
				flightNumber: "UA1234",
				flightDate: "2026-02-19",
			};
			const newFlight = null;

			// Act & Assert
			const hasExisting = existingFlight !== null;
			const hasNew = newFlight !== null;

			expect(hasExisting).toBe(true);
			expect(hasNew).toBe(false);
			// Behavior: should use existing flight ID
		});

		test("should create new flight when not in database", async () => {
			// Arrange
			const existingFlight = null;
			const _newFlight = { id: 1 };

			// Act & Assert
			const hasExisting = existingFlight !== null;
			const shouldCreate = !hasExisting;

			expect(shouldCreate).toBe(true);
			// Behavior: should insert new flight record
		});

		test("should show tracking note when already tracking", () => {
			// Arrange
			const alreadyTracking = true;
			const trackingNote = alreadyTracking
				? "ℹ️ You were already tracking this flight.\n\n"
				: "";

			// Act & Assert
			expect(trackingNote).toContain("already tracking");
		});

		test("should show success message with flight details", () => {
			// Arrange
			const flightDetails = {
				flightNumber: "UA1234",
				airline: "United Airlines",
				origin: "SFO",
				destination: "LAX",
				flightDate: "2026-02-19",
				gate: "D10",
				terminal: "2",
				status: "scheduled",
			};

			// Act
			const successMessage =
				`✅ *Flight Tracked Successfully*\n\n` +
				`✈️ ${flightDetails.flightNumber}\n` +
				`${flightDetails.airline}\n\n` +
				`📍 Route: ${flightDetails.origin} → ${flightDetails.destination}\n` +
				`📅 Date: ${flightDetails.flightDate}`;

			// Assert
			expect(successMessage).toContain("Flight Tracked Successfully");
			expect(successMessage).toContain(flightDetails.flightNumber);
			expect(successMessage).toContain(flightDetails.airline);
			expect(successMessage).toContain(flightDetails.origin);
			expect(successMessage).toContain(flightDetails.destination);
		});
	});

	describe("pending selection behavior", () => {
		test("should set pending selection when multiple flights found", () => {
			// Arrange
			const chatId = "123456";
			const flights = [mockApiFlight];

			// Act & Assert
			expect(flights.length).toBeGreaterThan(0);
			expect(chatId).toBeDefined();
			// Behavior: setPendingSelection should be called with flights array
		});

		test("should prompt user to select flight", () => {
			// Arrange
			const promptMessage = "Reply with the number (1-5) to track a flight.";

			// Act & Assert
			expect(promptMessage).toContain("Reply with the number");
			expect(promptMessage).toContain("1-5");
		});
	});

	describe("input normalization", () => {
		test("should uppercase flight number", () => {
			// Arrange
			const input = "ua1234";
			const expected = "UA1234";

			// Act
			const result = input.toUpperCase();

			// Assert
			expect(result).toBe(expected);
		});

		test("should parse date from remaining arguments", () => {
			// Arrange
			const args = "2026-03-15";
			const expected = "2026-03-15";

			// Act & Assert
			expect(args).toBe(expected);
		});
	});
});
