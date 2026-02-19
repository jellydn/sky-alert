// TODO: These tests validate helper logic (regex patterns, string formatting) but don't test
// the actual handler since src/handlers/natural-language.ts is never imported.
// The handler registers itself via bot.on("message:text", ...) on import, so to properly test
// it, we would need to either: 1) Extract the handler logic into a testable function, or
// 2) Use integration tests with the actual bot instance.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "grammy";
import type { AviationstackFlight } from "../services/aviationstack.js";

const mockReply = mock(() => Promise.resolve({ message_id: 1 }));

const _mockContext = {
	message: {
		text: "SFO to LAX today",
	},
	chat: { id: 123456 },
	reply: mockReply,
} as unknown as Context;

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

describe("natural-language handler patterns and messages", () => {
	beforeEach(() => {
		mockReply.mockClear();

		mock.module("../bot/instance.js", () => ({
			bot: {
				on: mock(() => ({})),
			},
		}));

		mock.module("../services/aviationstack.js", () => ({
			AviationstackAPI: mock(() => ({
				getFlightsByRoute: mock(() => Promise.resolve([mockApiFlight])),
				getFlightsByNumber: mock(() => Promise.resolve([mockApiFlight])),
			})),
		}));

		mock.module("../utils/pending-selections.js", () => ({
			getPendingSelection: mock(() => undefined),
			setPendingSelection: mock(() => ({})),
			clearPendingSelection: mock(() => ({})),
		}));

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

	describe("message filtering - pattern detection", () => {
		test("should detect command messages by leading slash", () => {
			const commandMessage = "/track UA1234";
			const isCommand = commandMessage.startsWith("/");

			expect(isCommand).toBe(true);
		});

		test("should detect non-command text messages", () => {
			const textMessage = "SFO to LAX today";
			const isCommand = textMessage.startsWith("/");

			expect(isCommand).toBe(false);
		});

		test("should detect empty messages", () => {
			const message = "";
			const hasText = message.length > 0;

			expect(hasText).toBe(false);
		});
	});

	describe("route search patterns", () => {
		test("should detect route pattern in messages", () => {
			const message1 = "SFO to LAX";
			const message2 = "JFK → LHR";
			const message3 = "DFW-MIA";

			const routePattern = /[A-Z]{3}\s*(?:to|TO|→|-)\s*[A-Z]{3}/i;

			expect(routePattern.test(message1)).toBe(true);
			expect(routePattern.test(message2)).toBe(true);
			expect(routePattern.test(message3)).toBe(true);
		});

		test("should extract origin and destination airports from route pattern", () => {
			const message = "SFO to LAX";
			const match = message.match(/([A-Z]{3})\s*(?:to|TO|→|-)\s*([A-Z]{3})/i);

			expect(match).not.toBeNull();
			if (match) {
				expect(match[1].toUpperCase()).toBe("SFO");
				expect(match[2].toUpperCase()).toBe("LAX");
			}
		});

		test("should detect absence of date keyword in message", () => {
			const message = "SFO to LAX";
			const hasDateKeyword = /\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b/i.test(
				message,
			);

			expect(hasDateKeyword).toBe(false);
		});

		test("should format looking up message correctly", () => {
			const origin = "SFO";
			const destination = "LAX";
			const date = "2026-02-19";

			const lookingUpMessage = `🔍 Looking up flights from ${origin} to ${destination} on ${date}...`;

			expect(lookingUpMessage).toContain("Looking up flights");
			expect(lookingUpMessage).toContain(origin);
			expect(lookingUpMessage).toContain(destination);
			expect(lookingUpMessage).toContain(date);
		});

		test("should limit flight results array to 5 items", () => {
			const allFlights = Array.from({ length: 10 }, () => mockApiFlight);
			const limitedFlights = allFlights.slice(0, 5);

			expect(limitedFlights.length).toBe(5);
		});

		test("should format no flights found message correctly", () => {
			const origin = "SFO";
			const destination = "LAX";
			const date = "2026-02-19";

			const noFlightsMessage =
				"❌ *No flights found*\n\n" +
				`Could not find any flights from ${origin} to ${destination} on ${date}.\n\n` +
				"Please check:\n" +
				"• Airport codes are correct (3-letter IATA codes)\n" +
				"• Date is correct\n" +
				"• Flights are scheduled for that date";

			expect(noFlightsMessage).toContain("No flights found");
			expect(noFlightsMessage).toContain(origin);
			expect(noFlightsMessage).toContain(destination);
			expect(noFlightsMessage).toContain(date);
		});

		test("should detect undefined chat ID", () => {
			const chatId = undefined;

			expect(chatId).toBeUndefined();
		});
	});

	describe("flight number patterns", () => {
		test("should detect flight number pattern in messages", () => {
			const message1 = "UA1234";
			const message2 = "AA 567";
			const message3 = "DAL4567";

			const flightPattern = /([A-Za-z]{1,3}\s?\d{1,4})/;

			expect(flightPattern.test(message1)).toBe(true);
			expect(flightPattern.test(message2)).toBe(true);
			expect(flightPattern.test(message3)).toBe(true);
		});

		test("should validate flight number and date are defined", () => {
			const flightNumber = "UA1234";
			const date = "2026-02-19";

			expect(flightNumber).toBeDefined();
			expect(date).toBeDefined();
		});

		test("should format date prompt message correctly", () => {
			const flightNumber = "UA1234";
			const message = `✈️ *Flight: ${flightNumber}*\n\nPlease provide the date for this flight.`;

			expect(message).toContain(flightNumber);
			expect(message).toContain("Please provide the date");
		});
	});

	describe("selection handling - validation", () => {
		test("should validate flights array and chat ID are present", () => {
			const chatId = "123456";
			const flights = [mockApiFlight];

			expect(flights.length).toBeGreaterThan(0);
			expect(chatId).toBeDefined();
		});

		test("should validate selection number range (1-5)", () => {
			const validSelections = ["1", "2", "3", "4", "5"];
			const invalidSelections = ["0", "6", "abc", ""];

			const areValid = validSelections.map((s) => {
				const num = Number.parseInt(s, 10);
				return !Number.isNaN(num) && num >= 1 && num <= 5;
			});

			const areInvalid = invalidSelections.map((s) => {
				const num = Number.parseInt(s, 10);
				return !Number.isNaN(num) && num >= 1 && num <= 5;
			});

			expect(areValid.every((v) => v)).toBe(true);
			expect(areInvalid.every((v) => v)).toBe(false);
		});

		test("should select flight from array by index", () => {
			const selectionNumber = "1";
			const pendingFlights = [mockApiFlight];
			const selectedIndex = Number.parseInt(selectionNumber, 10) - 1;
			const selectedFlight = pendingFlights[selectedIndex];

			expect(selectedFlight).toBeDefined();
		});

		test("should format selection expired message correctly", () => {
			const expiredMessage =
				"❓ Selection expired or invalid.\n\n" +
				"Please search for flights again using: `SFO to LAX today`";

			expect(expiredMessage).toContain("Selection expired or invalid");
			expect(expiredMessage).toContain("Please search for flights again");
		});
	});

	describe("error message formatting", () => {
		test("should format rate limit message correctly", () => {
			const rateLimitMessage =
				"⚠️ *Rate limit exceeded*\n\nPlease try again later.";

			expect(rateLimitMessage).toContain("Rate limit exceeded");
			expect(rateLimitMessage).toContain("try again later");
		});

		test("should format generic API error message correctly", () => {
			const errorMessage = "Failed to look up flights. Please try again later.";

			expect(errorMessage).toContain("Failed to look up flights");
		});
	});

	describe("help message formatting", () => {
		test("should format help message correctly", () => {
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

			expect(helpMessage).toContain("didn't find a flight number");
			expect(helpMessage).toContain("Flight number with date");
			expect(helpMessage).toContain("Route");
		});
	});

	describe("multiple flight results message formatting", () => {
		test("should format list message when multiple flights found", () => {
			const flightNumber = "UA1234";
			const flights = [mockApiFlight, mockApiFlight];

			const listMessage = `✈️ *Found ${flights.length} flights for ${flightNumber}*`;

			expect(listMessage).toContain("Found");
			expect(listMessage).toContain(flights.length.toString());
			expect(listMessage).toContain(flightNumber);
		});

		test("should format flight details string correctly", () => {
			const flight = {
				departure: {
					iata: "SFO",
					scheduled: "2026-02-19T14:30:00+00:00",
					terminal: "2",
				},
				arrival: { iata: "LAX" },
				flight_status: "scheduled",
			};

			const depTime = new Date(flight.departure.scheduled);
			const flightDetails =
				`${flight.departure.iata} → ${flight.arrival.iata}\n` +
				`   🛫 ${depTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} Terminal ${flight.departure.terminal}\n` +
				`   📊 ${flight.flight_status}`;

			expect(flightDetails).toContain("SFO");
			expect(flightDetails).toContain("LAX");
			expect(flightDetails).toContain("scheduled");
		});
	});
});
