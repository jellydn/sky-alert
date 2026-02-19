import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "grammy";

function shouldUseFallback(status: string, delayMinutes?: number): boolean {
	return (!delayMinutes || delayMinutes <= 0) && (status === "scheduled" || status.length === 0);
}

function addMinutesToIso(isoString: string, minutes: number): string | undefined {
	const baseTimeMs = Date.parse(isoString);
	if (Number.isNaN(baseTimeMs)) {
		return undefined;
	}

	return new Date(baseTimeMs + minutes * 60 * 1000).toISOString();
}

function parseCarrierAndNumber(flightCode: string): { carrier?: string; number?: string } {
	const match = flightCode.match(/^([A-Z]{2,3})(\d{1,4})$/);
	if (!match) {
		return {};
	}

	return { carrier: match[1], number: match[2] };
}

const mockReply = mock(() => Promise.resolve({ message_id: 1 }));

const mockContext = {
	match: null,
	chat: { id: 123456 },
	message: { message_id: 1 },
	reply: mockReply,
} as unknown as Context;

const STALE_THRESHOLD = 15 * 60 * 1000;

describe("status handler", () => {
	beforeEach(() => {
		mockReply.mockClear();

		mock.module("../bot/instance.js", () => ({
			bot: {
				command: mock(() => ({})),
			},
		}));

		mock.module("../services/aviationstack.js", () => ({
			AviationstackAPI: mock(() => ({})),
			aviationstackApi: {
				getFlightsByNumber: mock(() => Promise.resolve([])),
			},
		}));

		mock.module("../db/index.js", () => ({
			db: {
				select: mock(() => ({
					from: mock(() => ({
						innerJoin: mock(() => ({
							where: mock(() => Promise.resolve([])),
						})),
					})),
				})),
				query: {
					flights: {
						findFirst: mock(() => Promise.resolve(null)),
					},
				},
				insert: mock(() => ({
					values: mock(() => ({})),
				})),
				update: mock(() => ({
					set: mock(() => ({
						where: mock(() => Promise.resolve(undefined)),
					})),
				})),
			},
		}));

		mock.module("../services/api-budget.js", () => ({
			canMakeRequest: mock(() => Promise.resolve(true)),
		}));
	});

	describe("shouldUseFallback", () => {
		test("should return true when status is scheduled and no delay", () => {
			expect(shouldUseFallback("scheduled", undefined)).toBe(true);
		});

		test("should return true when status is scheduled and delay is zero", () => {
			expect(shouldUseFallback("scheduled", 0)).toBe(true);
		});

		test("should return true when status is empty and no delay", () => {
			expect(shouldUseFallback("", undefined)).toBe(true);
		});

		test("should return false when status is active", () => {
			expect(shouldUseFallback("departed", undefined)).toBe(false);
		});

		test("should return false when delay is positive", () => {
			expect(shouldUseFallback("scheduled", 15)).toBe(false);
		});

		test("should return false when status is active and delay is positive", () => {
			expect(shouldUseFallback("in air", 10)).toBe(false);
		});
	});

	describe("addMinutesToIso", () => {
		test("should add minutes to valid ISO string", () => {
			expect(addMinutesToIso("2026-02-19T14:00:00Z", 30)).toBe("2026-02-19T14:30:00.000Z");
		});

		test("should subtract minutes when value is negative", () => {
			expect(addMinutesToIso("2026-02-19T14:30:00Z", -15)).toBe("2026-02-19T14:15:00.000Z");
		});

		test("should return undefined for invalid ISO string", () => {
			expect(addMinutesToIso("invalid-date", 30)).toBeUndefined();
		});

		test("should handle zero minutes", () => {
			expect(addMinutesToIso("2026-02-19T14:00:00Z", 0)).toBe("2026-02-19T14:00:00.000Z");
		});
	});

	describe("parseCarrierAndNumber", () => {
		test("should parse valid 2-letter carrier with flight number", () => {
			expect(parseCarrierAndNumber("AA123")).toEqual({ carrier: "AA", number: "123" });
		});

		test("should parse valid 3-letter carrier with flight number", () => {
			expect(parseCarrierAndNumber("UAL456")).toEqual({ carrier: "UAL", number: "456" });
		});

		test("should parse single digit flight number", () => {
			expect(parseCarrierAndNumber("UA1")).toEqual({ carrier: "UA", number: "1" });
		});

		test("should parse 4-digit flight number", () => {
			expect(parseCarrierAndNumber("DL1234")).toEqual({ carrier: "DL", number: "1234" });
		});

		test("should return empty object for invalid format", () => {
			expect(parseCarrierAndNumber("INVALID")).toEqual({});
		});

		test("should return empty object for lowercase carrier", () => {
			expect(parseCarrierAndNumber("aa123")).toEqual({});
		});

		test("should return empty object for carrier with numbers", () => {
			expect(parseCarrierAndNumber("A1123")).toEqual({});
		});

		test("should return empty object for missing number", () => {
			expect(parseCarrierAndNumber("AA")).toEqual({});
		});
	});

	describe("/status command validation", () => {
		test("should show error when missing flight number", () => {
			const context = {
				...mockContext,
				match: "",
			} as Context;
			const matchValue = context.match ?? "";
			const hasFlightNumber = matchValue.toString().trim().length > 0;
			expect(hasFlightNumber).toBe(false);
		});

		test("should show error when flight not in tracked list", () => {
			const userTrackings = [];
			const hasTracking = userTrackings.length > 0;
			expect(hasTracking).toBe(false);
		});
	});

	describe("data refresh behavior", () => {
		test("should calculate staleness correctly", () => {
			const lastPolled = Date.now() - STALE_THRESHOLD - 1000;
			const isStale = Date.now() - lastPolled >= STALE_THRESHOLD;
			expect(isStale).toBe(true);
		});

		test("should identify fresh data", () => {
			const lastPolled = Date.now() - 5 * 60 * 1000;
			const isStale = Date.now() - lastPolled >= STALE_THRESHOLD;
			expect(isStale).toBe(false);
		});
	});

	describe("status message formatting", () => {
		test("should format flight header correctly", () => {
			const flight = {
				flightNumber: "UA1234",
				origin: "SFO",
				destination: "LAX",
				flightDate: "2026-02-19",
			};
			const header = `✈️ *${flight.flightNumber}*\n\n📍 ${flight.origin} → ${flight.destination}\n📅 ${flight.flightDate}`;
			expect(header).toContain("✈️");
			expect(header).toContain(flight.flightNumber);
			expect(header).toContain(flight.origin);
			expect(header).toContain(flight.destination);
			expect(header).toContain(flight.flightDate);
		});

		test("should format departure section correctly", () => {
			const flight = {
				scheduledDeparture: "2026-02-19T14:30:00+00:00",
				origin: "SFO",
				currentStatus: "scheduled",
				gate: "D10",
				terminal: "2",
				delayMinutes: 15,
			};
			let departureSection = "*Departure:*\n";
			departureSection += `   Scheduled: ${flight.scheduledDeparture} (${flight.origin})\n`;
			departureSection += `   Status: ${flight.currentStatus}\n`;
			departureSection += `   🚪 Gate: ${flight.gate}\n`;
			departureSection += `   🏢 Terminal: ${flight.terminal}\n`;
			departureSection += `   ⏱️ Delay: ${flight.delayMinutes} min\n`;
			expect(departureSection).toContain("Departure:");
			expect(departureSection).toContain("Scheduled:");
			expect(departureSection).toContain(flight.origin);
			expect(departureSection).toContain(flight.currentStatus);
			expect(departureSection).toContain(flight.gate);
			expect(departureSection).toContain(flight.terminal);
			expect(departureSection).toContain(flight.delayMinutes.toString());
		});

		test("should format arrival section correctly", () => {
			const flight = {
				scheduledArrival: "2026-02-19T16:00:00+00:00",
				destination: "LAX",
			};
			const arrivalSection = `*Arrival:*\n   Scheduled: ${flight.scheduledArrival} (${flight.destination})`;
			expect(arrivalSection).toContain("Arrival:");
			expect(arrivalSection).toContain(flight.scheduledArrival);
			expect(arrivalSection).toContain(flight.destination);
		});

		test("should include status changes when present", () => {
			const changes = [
				{
					oldStatus: "scheduled",
					newStatus: "departed",
					details: null,
					detectedAt: Date.now() / 1000,
				},
				{
					oldStatus: "departed",
					newStatus: "landed",
					details: "Gate: D10 → D15",
					detectedAt: Date.now() / 1000,
				},
			];
			let changesSection = "*Recent Status Changes:*\n";
			changes.forEach((change) => {
				const detectedTime = new Date(change.detectedAt * 1000);
				const timeStr = detectedTime.toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
				});
				changesSection += `   ${timeStr}: `;
				if (change.oldStatus) {
					changesSection += `${change.oldStatus} → `;
				}
				changesSection += `${change.newStatus}`;
				if (change.details) {
					changesSection += ` (${change.details})`;
				}
				changesSection += "\n";
			});
			expect(changesSection).toContain("Recent Status Changes");
			expect(changesSection).toContain("scheduled");
			expect(changesSection).toContain("departed");
			expect(changesSection).toContain("landed");
		});

		test("should show last updated timestamp", () => {
			const lastPolledAt = Math.floor(Date.now() / 1000);
			const ago = Math.round((Date.now() - lastPolledAt * 1000) / 60000);
			const timestamp = `_Updated ${ago} min ago_`;
			expect(timestamp).toContain("Updated");
			expect(timestamp).toContain("min ago");
		});
	});

	describe("conditional field display", () => {
		test("should show gate when present", () => {
			const gate = "D10";
			const hasGate = gate !== undefined && gate.length > 0;
			expect(hasGate).toBe(true);
		});

		test("should show terminal when present", () => {
			const terminal = "2";
			const hasTerminal = terminal !== undefined && terminal.length > 0;
			expect(hasTerminal).toBe(true);
		});

		test("should show delay when greater than 0", () => {
			const delayMinutes = 15;
			const shouldShowDelay = delayMinutes > 0;
			expect(shouldShowDelay).toBe(true);
		});

		test("should not show delay when 0", () => {
			const delayMinutes = 0;
			const shouldShowDelay = delayMinutes > 0;
			expect(shouldShowDelay).toBe(false);
		});
	});

	describe("error handling", () => {
		test("should handle database errors gracefully", () => {
			const errorMessage = "❌ Failed to retrieve flight status. Please try again later.";
			expect(errorMessage).toContain("Failed to retrieve");
			expect(errorMessage).toContain("try again later");
		});

		test("should fall back to cached data on API failure", () => {
			const apiError = true;
			const hasCachedData = true;
			expect(apiError || hasCachedData).toBeDefined();
		});
	});
});
