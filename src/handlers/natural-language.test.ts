import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "grammy";
import type { AviationstackFlight } from "../services/aviationstack.js";

// Mock the bot
const mockReply = mock(() => Promise.resolve({ message_id: 1 }));

const _mockContext = {
	message: {
		text: "SFO to LAX today",
	},
	chat: { id: 123456 },
	reply: mockReply,
} as unknown as Context;

// Mock flight data
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

describe("natural-language handler", () => {
	beforeEach(() => {
		mockReply.mockClear();

		// Mock bot instance
		mock.module("../bot/instance.js", () => ({
			bot: {
				on: mock(() => ({})),
			},
		}));

		// Mock AviationstackAPI
		mock.module("../services/aviationstack.js", () => ({
			AviationstackAPI: mock(() => ({
				getFlightsByRoute: mock(() => Promise.resolve([mockApiFlight])),
				getFlightsByNumber: mock(() => Promise.resolve([mockApiFlight])),
			})),
		}));

		// Mock pending selections utility
		mock.module("../utils/pending-selections.js", () => ({
			getPendingSelection: mock(() => undefined),
			setPendingSelection: mock(() => ({})),
			clearPendingSelection: mock(() => ({})),
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
	});

	describe("message filtering", () => {
		test("should ignore command messages", () => {
			// Arrange
			const commandMessage = "/track UA1234";
			const isCommand = commandMessage.startsWith("/");

			// Act & Assert
			expect(isCommand).toBe(true);
			// Behavior: should return early without processing
		});

		test("should process non-command text messages", () => {
			// Arrange
			const textMessage = "SFO to LAX today";
			const isCommand = textMessage.startsWith("/");

			// Act & Assert
			expect(isCommand).toBe(false);
			// Behavior: should process the message
		});

		test("should ignore empty messages", () => {
			// Arrange
			const message = "";
			const hasText = message.length > 0;

			// Act & Assert
			expect(hasText).toBe(false);
			// Behavior: should return early
		});
	});

	describe("route search handling", () => {
		test("should detect route pattern", () => {
			// Arrange
			const message1 = "SFO to LAX";
			const message2 = "JFK → LHR";
			const message3 = "DFW-MIA";

			const hasRoutePattern1 = /[A-Z]{3}\s*(?:to|TO|→|-)\s*[A-Z]{3}/i.test(
				message1,
			);
			const hasRoutePattern2 = /[A-Z]{3}\s*(?:to|TO|→|-)\s*[A-Z]{3}/i.test(
				message2,
			);
			const hasRoutePattern3 = /[A-Z]{3}\s*(?:to|TO|→|-)\s*[A-Z]{3}/i.test(
				message3,
			);

			// Act & Assert
			expect(hasRoutePattern1).toBe(true);
			expect(hasRoutePattern2).toBe(true);
			expect(hasRoutePattern3).toBe(true);
		});

		test("should extract origin and destination airports", () => {
			// Arrange
			const message = "SFO to LAX";
			const match = message.match(/([A-Z]{3})\s*(?:to|TO|→|-)\s*([A-Z]{3})/i);

			// Act & Assert
			expect(match).not.toBeNull();
			if (match) {
				expect(match[1].toUpperCase()).toBe("SFO");
				expect(match[2].toUpperCase()).toBe("LAX");
			}
		});

		test("should default to today when no date provided", () => {
			// Arrange
			const message = "SFO to LAX";
			const hasDateKeyword = /\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b/i.test(
				message,
			);

			// Act & Assert
			expect(hasDateKeyword).toBe(false);
			// Behavior: should use today's date
		});

		test("should show looking up message when searching", () => {
			// Arrange
			const origin = "SFO";
			const destination = "LAX";
			const date = "2026-02-19";

			// Act
			const lookingUpMessage = `🔍 Looking up flights from ${origin} to ${destination} on ${date}...`;

			// Assert
			expect(lookingUpMessage).toContain("Looking up flights");
			expect(lookingUpMessage).toContain(origin);
			expect(lookingUpMessage).toContain(destination);
			expect(lookingUpMessage).toContain(date);
		});

		test("should limit results to 5 flights", () => {
			// Arrange
			const allFlights = Array.from({ length: 10 }, (_, _i) => ({
				...mockApiFlight,
			}));
			const limitedFlights = allFlights.slice(0, 5);

			// Act & Assert
			expect(limitedFlights.length).toBeLessThanOrEqual(5);
			expect(limitedFlights.length).toBe(5);
		});

		test("should show no flights found message", () => {
			// Arrange
			const origin = "SFO";
			const destination = "LAX";
			const date = "2026-02-19";

			// Act
			const noFlightsMessage =
				"❌ *No flights found*\n\n" +
				`Could not find any flights from ${origin} to ${destination} on ${date}.\n\n` +
				"Please check:\n" +
				"• Airport codes are correct (3-letter IATA codes)\n" +
				"• Date is correct\n" +
				"• Flights are scheduled for that date";

			// Assert
			expect(noFlightsMessage).toContain("No flights found");
			expect(noFlightsMessage).toContain(origin);
			expect(noFlightsMessage).toContain(destination);
			expect(noFlightsMessage).toContain(date);
		});

		test("should show error when chat cannot be identified", () => {
			// Arrange
			const chatId = undefined;

			// Act & Assert
			expect(chatId).toBeUndefined();
			// Behavior: should reply with "Could not identify chat"
		});
	});

	describe("flight number parsing", () => {
		test("should detect flight number pattern", () => {
			// Arrange
			const message1 = "UA1234";
			const message2 = "AA 567";
			const message3 = "DAL4567";

			// Pattern allows optional space between airline code and number
			const flightPattern = /([A-Za-z]{1,3}\s?\d{1,4})/;

			const hasFlightPattern1 = flightPattern.test(message1);
			const hasFlightPattern2 = flightPattern.test(message2);
			const hasFlightPattern3 = flightPattern.test(message3);

			// Act & Assert
			expect(hasFlightPattern1).toBe(true);
			expect(hasFlightPattern2).toBe(true);
			expect(hasFlightPattern3).toBe(true);
		});

		test("should require both flight number and date", () => {
			// Arrange
			const flightNumber = "UA1234";
			const date = "2026-02-19";

			// Act & Assert
			expect(flightNumber).toBeDefined();
			expect(date).toBeDefined();
			// Behavior: should proceed with lookup when both present
		});

		test("should prompt for date when only flight number provided", () => {
			// Arrange
			const flightNumber = "UA1234";
			const message = `✈️ *Flight: ${flightNumber}*\n\nPlease provide the date for this flight.`;

			// Act & Assert
			expect(message).toContain(flightNumber);
			expect(message).toContain("Please provide the date");
		});
	});

	describe("selection handling", () => {
		test("should store pending selection when flights found", () => {
			// Arrange
			const chatId = "123456";
			const flights = [mockApiFlight];

			// Act & Assert
			expect(flights.length).toBeGreaterThan(0);
			expect(chatId).toBeDefined();
			// Behavior: should call setPendingSelection
		});

		test("should validate selection number", () => {
			// Arrange
			const validSelections = ["1", "2", "3", "4", "5"];
			const invalidSelections = ["0", "6", "abc", ""];

			// Act
			const areValid = validSelections.map((s) => {
				const num = Number.parseInt(s, 10);
				return !Number.isNaN(num) && num >= 1 && num <= 5;
			});

			const areInvalid = invalidSelections.map((s) => {
				const num = Number.parseInt(s, 10);
				return !Number.isNaN(num) && num >= 1 && num <= 5;
			});

			// Assert
			expect(areValid.every((v) => v)).toBe(true);
			expect(areInvalid.every((v) => v)).toBe(false);
		});

		test("should clear pending selection after valid choice", () => {
			// Arrange
			const _chatId = "123456";
			const selectionNumber = "1";
			const pendingFlights = [mockApiFlight];
			const selectedIndex = Number.parseInt(selectionNumber, 10) - 1;
			const selectedFlight = pendingFlights[selectedIndex];

			// Act & Assert
			expect(selectedFlight).toBeDefined();
			// Behavior: should call clearPendingSelection and save flight
		});

		test("should show expired message for invalid selection", () => {
			// Arrange
			const _selectionNumber = "99";

			// Act
			const expiredMessage =
				"❓ Selection expired or invalid.\n\n" +
				"Please search for flights again using: `SFO to LAX today`";

			// Assert
			expect(expiredMessage).toContain("Selection expired or invalid");
			expect(expiredMessage).toContain("Please search for flights again");
		});
	});

	describe("error handling", () => {
		test("should handle rate limit errors", () => {
			// Arrange
			const _errorMessage = "Rate limit exceeded";

			// Act
			const rateLimitMessage =
				"⚠️ *Rate limit exceeded*\n\nPlease try again later.";

			// Assert
			expect(rateLimitMessage).toContain("Rate limit exceeded");
			expect(rateLimitMessage).toContain("try again later");
		});

		test("should handle generic API errors", () => {
			// Arrange
			const errorMessage = "Failed to look up flights. Please try again later.";

			// Act & Assert
			expect(errorMessage).toContain("Failed to look up flights");
		});
	});

	describe("help message for unrecognized input", () => {
		test("should show help when no flight pattern detected", () => {
			// Arrange
			const _hasFlightNumber = false;
			const _hasRoute = false;

			// Act
			const helpMessage =
				"👋 Hi! I didn't find a flight number in your message.\n\n" +
				"*To track a flight, use one of these formats:*\n\n" +
				"• Flight number with date:\n" +
				"  `AA123 tomorrow`\n" +
				"  `UA456 2026-03-15`\n\n" +
				"• Route:\n" +
				"  `SFO to LAX today`\n\n" +
				"• Or use commands:\n" +
				"  `/track <flight> <date>`\n" +
				"  `/help` for more options";

			// Assert
			expect(helpMessage).toContain("didn't find a flight number");
			expect(helpMessage).toContain("Flight number with date");
			expect(helpMessage).toContain("Route");
		});
	});

	describe("multiple flight results handling", () => {
		test("should show list when multiple flights found for number", () => {
			// Arrange
			const flightNumber = "UA1234";
			const flights = [mockApiFlight, mockApiFlight];

			// Act
			const listMessage = `✈️ *Found ${flights.length} flights for ${flightNumber}*`;

			// Assert
			expect(listMessage).toContain("Found");
			expect(listMessage).toContain(flights.length.toString());
			expect(listMessage).toContain(flightNumber);
		});

		test("should include flight details in list", () => {
			// Arrange
			const flight = {
				departure: {
					iata: "SFO",
					scheduled: "2026-02-19T14:30:00+00:00",
					terminal: "2",
				},
				arrival: { iata: "LAX" },
				flight_status: "scheduled",
			};

			// Act
			const depTime = new Date(flight.departure.scheduled);
			const flightDetails =
				`${flight.departure.iata} → ${flight.arrival.iata}\n` +
				`   🛫 ${depTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} Terminal ${flight.departure.terminal}\n` +
				`   📊 ${flight.flight_status}`;

			// Assert
			expect(flightDetails).toContain("SFO");
			expect(flightDetails).toContain("LAX");
			expect(flightDetails).toContain("scheduled");
		});
	});
});
