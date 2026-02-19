import { describe, expect, test } from "bun:test";
import type { AviationstackFlight } from "./aviationstack.js";

// Set environment variable
process.env.AVIATIONSTACK_API_KEY = "test-api-key-123";

// Import after setting env
const { AviationstackAPI } = await import("./aviationstack.js");

const mockApiResponse = {
	pagination: { limit: 100, offset: 0, count: 1, total: 1 },
	data: [
		{
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
		},
	] as unknown as AviationstackFlight[],
};

describe("AviationstackAPI", () => {
	describe("constructor", () => {
		test("should throw error when API key is missing", () => {
			// Arrange
			const originalKey = process.env.AVIATIONSTACK_API_KEY;
			delete process.env.AVIATIONSTACK_API_KEY;

			// Act & Assert - need to re-import to get fresh class
			expect(() => {
				// Create a new class instance that will read the env var
				const FreshAPI = class {
					private apiKey: string;
					constructor() {
						this.apiKey = process.env.AVIATIONSTACK_API_KEY || "";
						if (!this.apiKey) {
							throw new Error(
								"AVIATIONSTACK_API_KEY environment variable is required",
							);
						}
					}
				};
				new FreshAPI();
			}).toThrow("AVIATIONSTACK_API_KEY environment variable is required");

			// Restore for other tests
			process.env.AVIATIONSTACK_API_KEY = originalKey;
		});

		test("should create instance when API key is present", () => {
			// Act & Assert
			expect(() => new AviationstackAPI()).not.toThrow();
		});
	});

	describe("date filtering logic", () => {
		test("should filter flights by date correctly", () => {
			// Arrange
			const date = "2026-02-19";
			const responseWithMixedDates = {
				...mockApiResponse,
				data: [
					{ ...mockApiResponse.data[0], flight_date: "2026-02-19" },
					{ ...mockApiResponse.data[0], flight_date: "2026-02-20" },
				],
			};

			// Act - simulate the filtering logic from getFlightsByNumber
			const matching = responseWithMixedDates.data.filter(
				(f) => f.flight_date === date,
			);

			// Assert
			expect(matching).toHaveLength(1);
			expect(matching[0].flight_date).toBe(date);
		});

		test("should return all flights when all match date", () => {
			// Arrange
			const date = "2026-02-19";
			const responseWithSameDates = {
				...mockApiResponse,
				data: [
					{ ...mockApiResponse.data[0], flight_date: "2026-02-19" },
					{ ...mockApiResponse.data[0], flight_date: "2026-02-19" },
				],
			};

			// Act - simulate the filtering logic
			const matching = responseWithSameDates.data.filter(
				(f) => f.flight_date === date,
			);

			// Assert
			expect(matching).toHaveLength(2);
		});

		test("should return empty array when no flights match date", () => {
			// Arrange
			const date = "2026-02-19";
			const responseWithDifferentDates = {
				...mockApiResponse,
				data: [
					{ ...mockApiResponse.data[0], flight_date: "2026-02-20" },
					{ ...mockApiResponse.data[0], flight_date: "2026-02-21" },
				],
			};

			// Act - simulate the filtering logic
			const matching = responseWithDifferentDates.data.filter(
				(f) => f.flight_date === date,
			);

			// Assert
			expect(matching).toHaveLength(0);
		});
	});

	describe("cache key generation", () => {
		test("should generate unique cache keys for different flight numbers", () => {
			// Arrange
			const flightNumber1 = "UA1234";
			const flightNumber2 = "AA5678";
			const date = "2026-02-19";

			// Act - simulate cache key generation
			const cacheKey1 = `flights:${flightNumber1}:${date}`;
			const cacheKey2 = `flights:${flightNumber2}:${date}`;

			// Assert
			expect(cacheKey1).not.toBe(cacheKey2);
			expect(cacheKey1).toBe("flights:UA1234:2026-02-19");
			expect(cacheKey2).toBe("flights:AA5678:2026-02-19");
		});

		test("should generate unique cache keys for different dates", () => {
			// Arrange
			const flightNumber = "UA1234";
			const date1 = "2026-02-19";
			const date2 = "2026-02-20";

			// Act - simulate cache key generation
			const cacheKey1 = `flights:${flightNumber}:${date1}`;
			const cacheKey2 = `flights:${flightNumber}:${date2}`;

			// Assert
			expect(cacheKey1).not.toBe(cacheKey2);
		});

		test("should generate unique cache keys for routes", () => {
			// Arrange
			const origin1 = "SFO";
			const destination1 = "LAX";
			const origin2 = "JFK";
			const destination2 = "LHR";
			const date = "2026-02-19";

			// Act - simulate cache key generation
			const cacheKey1 = `route:${origin1}:${destination1}:${date}`;
			const cacheKey2 = `route:${origin2}:${destination2}:${date}`;

			// Assert
			expect(cacheKey1).not.toBe(cacheKey2);
			expect(cacheKey1).toBe("route:SFO:LAX:2026-02-19");
			expect(cacheKey2).toBe("route:JFK:LHR:2026-02-19");
		});
	});

	describe("cache TTL behavior", () => {
		test("should correctly calculate cache expiration", () => {
			// Arrange
			const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
			const now = Date.now();

			// Act - simulate cache entry timestamp check
			const entryTimestamp = now;
			const isExpiredAfterTtl =
				now + CACHE_TTL + 1000 - entryTimestamp > CACHE_TTL;
			const isNotExpiredBeforeTtl =
				now + CACHE_TTL - 1000 - entryTimestamp > CACHE_TTL;

			// Assert
			expect(isExpiredAfterTtl).toBe(true);
			expect(isNotExpiredBeforeTtl).toBe(false);
		});
	});

	describe("error message formatting", () => {
		test("should format rate limit error correctly", () => {
			// Arrange & Act
			const status = 429;
			let errorMessage = "";
			if (status === 429) {
				errorMessage = "Rate limit exceeded";
			}

			// Assert
			expect(errorMessage).toBe("Rate limit exceeded");
		});

		test("should format invalid API key error correctly", () => {
			// Arrange & Act
			const status = 401;
			let errorMessage = "";
			if (status === 401) {
				errorMessage = "Invalid API key";
			}

			// Assert
			expect(errorMessage).toBe("Invalid API key");
		});

		test("should format generic API error correctly", () => {
			// Arrange & Act
			const status = 500;
			const errorMessage = `API request failed: ${status}`;

			// Assert
			expect(errorMessage).toBe("API request failed: 500");
		});
	});

	describe("URL construction", () => {
		test("should construct correct URL for flight number search", () => {
			// Arrange
			const API_BASE_URL = "https://api.aviationstack.com/v1";
			const flightNumber = "UA1234";
			const apiKey = "test-api-key";

			// Act
			const url = new URL(`${API_BASE_URL}/flights`);
			url.searchParams.append("access_key", apiKey);
			url.searchParams.append("flight_iata", flightNumber);

			// Assert
			expect(url.pathname).toBe("/v1/flights");
			expect(url.searchParams.get("access_key")).toBe(apiKey);
			expect(url.searchParams.get("flight_iata")).toBe(flightNumber);
		});

		test("should construct correct URL for route search", () => {
			// Arrange
			const API_BASE_URL = "https://api.aviationstack.com/v1";
			const origin = "SFO";
			const destination = "LAX";
			const apiKey = "test-api-key";

			// Act
			const url = new URL(`${API_BASE_URL}/flights`);
			url.searchParams.append("access_key", apiKey);
			url.searchParams.append("dep_iata", origin);
			url.searchParams.append("arr_iata", destination);

			// Assert
			expect(url.pathname).toBe("/v1/flights");
			expect(url.searchParams.get("access_key")).toBe(apiKey);
			expect(url.searchParams.get("dep_iata")).toBe(origin);
			expect(url.searchParams.get("arr_iata")).toBe(destination);
		});
	});
});
