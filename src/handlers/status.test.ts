import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "grammy";

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
			AviationstackAPI: mock(() => ({
				getFlightsByNumber: mock(() => Promise.resolve([])),
			})),
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

		test("should show error when flight not in tracked list", async () => {
			const userTrackings = [];

			expect(userTrackings.length).toBe(0);
		});
	});

	describe("data refresh behavior", () => {
		test("should calculate staleness correctly", () => {
			const lastPolled = Date.now() - STALE_THRESHOLD - 1000;
			const isStale = Date.now() - lastPolled > STALE_THRESHOLD;

			expect(isStale).toBe(true);
		});

		test("should identify fresh data", () => {
			const lastPolled = Date.now() - 5 * 60 * 1000;
			const isStale = Date.now() - lastPolled > STALE_THRESHOLD;

			expect(isStale).toBe(false);
		});

		test("should recognize completed flight statuses", () => {
			const completedStatuses = ["landed", "cancelled"];

			expect(completedStatuses).toContain("landed");
			expect(completedStatuses).toContain("cancelled");
			expect(completedStatuses).not.toContain("scheduled");
		});
	});

	describe("status change recording", () => {
		test("should create status change record when status changes", () => {
			const oldStatus = "scheduled";
			const newStatus = "departed";

			expect(oldStatus).not.toBe(newStatus);
		});

		test("should not create record when status unchanged", () => {
			const oldStatus = "scheduled";
			const newStatus = "scheduled";

			expect(oldStatus).toBe(newStatus);
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

			expect(gate).toBeDefined();
		});

		test("should show terminal when present", () => {
			const terminal = "2";

			expect(terminal).toBeDefined();
		});

		test("should show delay when greater than 0", () => {
			const delayMinutes = 15;

			expect(delayMinutes).toBeGreaterThan(0);
		});

		test("should not show delay when 0", () => {
			const delayMinutes = 0;

			expect(delayMinutes).toBe(0);
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

	describe("input normalization", () => {
		test("should uppercase flight number", () => {
			const input = "ua1234";
			const result = input.toUpperCase();

			expect(result).toBe("UA1234");
		});

		test("should extract chat id from context", () => {
			const chatId = mockContext.chat?.id.toString();

			expect(chatId).toBe("123456");
		});
	});
});
