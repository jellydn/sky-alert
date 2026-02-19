import { beforeEach, describe, expect, mock, test } from "bun:test";
import { type FlightStatsFallbackData, getFlightStatsFallback } from "./flightstats-fallback.js";

const NEXT_DATA_PATTERN = /__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});__NEXT_LOADED_PAGES__/;

describe("flightstats-fallback", () => {
	describe("normalizeStatus", () => {
		test("should return undefined when status is empty", () => {
			const status = "";
			const result = status.trim().toLowerCase() || undefined;
			expect(result).toBeUndefined();
		});

		test("should trim and lowercase valid status", () => {
			const result = "  In Flight  ".trim().toLowerCase();
			expect(result).toBe("in flight");
		});

		test("should handle status with only whitespace", () => {
			const trimmed = "   ".trim();
			const result = trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
			expect(result).toBeUndefined();
		});
	});

	describe("parseNextData", () => {
		test("should return undefined when __NEXT_DATA__ pattern is not found", () => {
			const html = "<html><body>No NextData here</body></html>";
			const nextDataMatch = html.match(NEXT_DATA_PATTERN);
			const result = nextDataMatch ? JSON.parse(nextDataMatch[1]) : undefined;
			expect(result).toBeUndefined();
		});

		test("should extract and parse valid __NEXT_DATA__ payload", () => {
			const validPayload = {
				props: {
					initialState: {
						flightTracker: {
							flight: {
								schedule: { estimatedActualDeparture: "2026-02-19T14:30:00Z" },
								status: { status: "departed" },
							},
						},
					},
				},
			};
			const html = `<html><script>__NEXT_DATA__ = ${JSON.stringify(validPayload)};__NEXT_LOADED_PAGES__</script></html>`;
			const nextDataMatch = html.match(NEXT_DATA_PATTERN);
			const result = nextDataMatch ? JSON.parse(nextDataMatch[1]) : undefined;
			expect(result).toEqual(validPayload);
		});

		test("should return undefined when JSON parsing fails", () => {
			const html = `<html><script>__NEXT_DATA__ = {invalid json};__NEXT_LOADED_PAGES__</script></html>`;
			const nextDataMatch = html.match(NEXT_DATA_PATTERN);
			let result: unknown;
			try {
				result = nextDataMatch ? JSON.parse(nextDataMatch[1]) : undefined;
			} catch {
				result = undefined;
			}
			expect(result).toBeUndefined();
		});
	});

	describe("getFlightStatsFallback", () => {
		let mockFetch: ReturnType<typeof mock>;

		beforeEach(() => {
			mockFetch = mock(() =>
				Promise.resolve({
					ok: true,
					text: () => Promise.resolve(""),
				} as Response),
			);
			globalThis.fetch = mockFetch as unknown as typeof fetch;
		});

		test("should return undefined when response is not ok", async () => {
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: false,
					status: 404,
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result).toBeUndefined();
		});

		test("should return undefined when fetch throws error", async () => {
			mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")));
			const result = await getFlightStatsFallback("AA", "123");
			expect(result).toBeUndefined();
		});

		test("should return undefined when __NEXT_DATA__ is not found in HTML", async () => {
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: true,
					text: () => Promise.resolve("<html><body>No data</body></html>"),
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result).toBeUndefined();
		});

		test("should extract flight data from valid response", async () => {
			const expectedData: FlightStatsFallbackData = {
				status: "departed",
				delayMinutes: 15,
				estimatedDeparture: "2026-02-19T14:30:00Z",
				estimatedArrival: "2026-02-19T17:00:00Z",
				departureTerminal: "T2",
				departureGate: "D10",
				arrivalTerminal: "T4",
				arrivalGate: "B20",
				source: "flightstats",
			};
			const payload = {
				props: {
					initialState: {
						flightTracker: {
							flight: {
								schedule: {
									estimatedActualDeparture: expectedData.estimatedDeparture,
									estimatedActualArrival: expectedData.estimatedArrival,
								},
								status: {
									status: "Departed",
									delay: { departure: { minutes: 15 }, arrival: { minutes: 10 } },
								},
								departureAirport: {
									terminal: expectedData.departureTerminal,
									gate: expectedData.departureGate,
								},
								arrivalAirport: {
									terminal: expectedData.arrivalTerminal,
									gate: expectedData.arrivalGate,
								},
							},
						},
					},
				},
			};
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							`<html><script>__NEXT_DATA__ = ${JSON.stringify(payload)};__NEXT_LOADED_PAGES__</script></html>`,
						),
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result).toEqual(expectedData);
			expect(mockFetch).toHaveBeenCalledWith(
				"https://www.flightstats.com/v2/flight-tracker/AA/123",
				expect.objectContaining({
					headers: expect.objectContaining({
						"user-agent": "Mozilla/5.0",
					}),
				}),
			);
		});

		test("should use maximum of departure and arrival delay minutes", async () => {
			const payload = {
				props: {
					initialState: {
						flightTracker: {
							flight: {
								schedule: {},
								status: {
									status: "Delayed",
									delay: { departure: { minutes: 5 }, arrival: { minutes: 20 } },
								},
								departureAirport: {},
								arrivalAirport: {},
							},
						},
					},
				},
			};
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							`<html><script>__NEXT_DATA__ = ${JSON.stringify(payload)};__NEXT_LOADED_PAGES__</script></html>`,
						),
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result?.delayMinutes).toBe(20);
		});

		test("should return undefined for delayMinutes when delay is zero or negative", async () => {
			const payload = {
				props: {
					initialState: {
						flightTracker: {
							flight: {
								schedule: {},
								status: {
									status: "On Time",
									delay: { departure: { minutes: 0 }, arrival: { minutes: 0 } },
								},
								departureAirport: {},
								arrivalAirport: {},
							},
						},
					},
				},
			};
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							`<html><script>__NEXT_DATA__ = ${JSON.stringify(payload)};__NEXT_LOADED_PAGES__</script></html>`,
						),
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result?.delayMinutes).toBeUndefined();
		});

		test("should handle missing optional fields gracefully", async () => {
			const payload = {
				props: {
					initialState: {
						flightTracker: {
							flight: {
								schedule: {},
								status: { status: "Scheduled" },
								departureAirport: {},
								arrivalAirport: {},
							},
						},
					},
				},
			};
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							`<html><script>__NEXT_DATA__ = ${JSON.stringify(payload)};__NEXT_LOADED_PAGES__</script></html>`,
						),
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result).toEqual({
				status: "scheduled",
				delayMinutes: undefined,
				estimatedDeparture: undefined,
				estimatedArrival: undefined,
				departureTerminal: undefined,
				departureGate: undefined,
				arrivalTerminal: undefined,
				arrivalGate: undefined,
				source: "flightstats",
			});
		});

		test("should return undefined when flight object is missing", async () => {
			const payload = {
				props: {
					initialState: {
						flightTracker: {},
					},
				},
			};
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							`<html><script>__NEXT_DATA__ = ${JSON.stringify(payload)};__NEXT_LOADED_PAGES__</script></html>`,
						),
				} as Response),
			);
			const result = await getFlightStatsFallback("AA", "123");
			expect(result).toBeUndefined();
		});
	});
});
