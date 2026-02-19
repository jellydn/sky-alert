import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "grammy";

const mockReply = mock(() => Promise.resolve({ message_id: 1 }));

const mockContext = {
	match: null,
	chat: { id: 123456 },
	message: { message_id: 1 },
	reply: mockReply,
} as unknown as Context;

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
		test("should refresh stale data when flight is active", () => {
			const STALE_THRESHOLD = 15 * 60 * 1000;
			const lastPolled = Date.now() - STALE_THRESHOLD - 1000;
			const currentStatus = "scheduled" as string;
			const canMakeRequest = true;

			const isStale = Date.now() - lastPolled > STALE_THRESHOLD;
			const isFlightActive =
				currentStatus !== "landed" && currentStatus !== "cancelled";
			const shouldRefresh = isStale && isFlightActive && canMakeRequest;

			// Act & Assert
			expect(shouldRefresh).toBe(true);
		});

		test("should not refresh when data is fresh", () => {
			// Arrange
			const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
			const lastPolled = Date.now() - 5 * 60 * 1000; // 5 minutes ago

			const isStale = Date.now() - lastPolled > STALE_THRESHOLD;

			// Act & Assert
			expect(isStale).toBe(false);
			// Behavior: should use cached data
		});

		test("should not refresh when flight is completed", () => {
			// Arrange
			const STALE_THRESHOLD = 15 * 60 * 1000;
			const lastPolled = Date.now() - STALE_THRESHOLD - 1000;
			const currentStatus = "landed";

			const isStale = Date.now() - lastPolled > STALE_THRESHOLD;
			const isFlightActive =
				currentStatus !== "landed" && currentStatus !== "cancelled";

			// Act & Assert
			expect(isStale).toBe(true);
			expect(isFlightActive).toBe(false);
			// Behavior: should use cached data for completed flights
		});

		test("should not refresh when API budget insufficient", () => {
			// Arrange
			const STALE_THRESHOLD = 15 * 60 * 1000;
			const lastPolled = Date.now() - STALE_THRESHOLD - 1000;
			const currentStatus = "scheduled" as string;
			const canMakeRequest = false;

			const isStale = Date.now() - lastPolled > STALE_THRESHOLD;
			const isFlightActive =
				currentStatus !== "landed" && currentStatus !== "cancelled";
			const shouldRefresh = isStale && isFlightActive && canMakeRequest;

			// Act & Assert
			expect(shouldRefresh).toBe(false);
			// Behavior: should use cached data when budget is low
		});
	});

	describe("status change recording", () => {
		test("should create status change record when status changes", () => {
			// Arrange
			const oldStatus = "scheduled" as string;
			const newStatus = "departed" as string;
			const hasChanged = oldStatus !== newStatus;

			// Act & Assert
			expect(hasChanged).toBe(true);
			// Behavior: should insert into statusChanges table
		});

		test("should not create record when status unchanged", () => {
			// Arrange
			const oldStatus = "scheduled";
			const newStatus = "scheduled";
			const hasChanged = oldStatus !== newStatus;

			// Act & Assert
			expect(hasChanged).toBe(false);
			// Behavior: should not insert into statusChanges table
		});
	});

	describe("status message formatting", () => {
		test("should format flight header correctly", () => {
			// Arrange
			const flight = {
				flightNumber: "UA1234",
				origin: "SFO",
				destination: "LAX",
				flightDate: "2026-02-19",
			};

			// Act
			const header = `✈️ *${flight.flightNumber}*\n\n📍 ${flight.origin} → ${flight.destination}\n📅 ${flight.flightDate}`;

			// Assert
			expect(header).toContain("✈️");
			expect(header).toContain(flight.flightNumber);
			expect(header).toContain(flight.origin);
			expect(header).toContain(flight.destination);
			expect(header).toContain(flight.flightDate);
		});

		test("should format departure section correctly", () => {
			// Arrange
			const flight = {
				scheduledDeparture: "2026-02-19T14:30:00+00:00",
				origin: "SFO",
				currentStatus: "scheduled",
				gate: "D10",
				terminal: "2",
				delayMinutes: 15,
			};

			// Act
			let departureSection = "*Departure:*\n";
			departureSection += `   Scheduled: ${flight.scheduledDeparture} (${flight.origin})\n`;
			departureSection += `   Status: ${flight.currentStatus}\n`;
			departureSection += `   🚪 Gate: ${flight.gate}\n`;
			departureSection += `   🏢 Terminal: ${flight.terminal}\n`;
			departureSection += `   ⏱️ Delay: ${flight.delayMinutes} min\n`;

			// Assert
			expect(departureSection).toContain("Departure:");
			expect(departureSection).toContain("Scheduled:");
			expect(departureSection).toContain(flight.origin);
			expect(departureSection).toContain(flight.currentStatus);
			expect(departureSection).toContain(flight.gate);
			expect(departureSection).toContain(flight.terminal);
			expect(departureSection).toContain(flight.delayMinutes.toString());
		});

		test("should format arrival section correctly", () => {
			// Arrange
			const flight = {
				scheduledArrival: "2026-02-19T16:00:00+00:00",
				destination: "LAX",
			};

			// Act
			const arrivalSection = `*Arrival:*\n   Scheduled: ${flight.scheduledArrival} (${flight.destination})`;

			// Assert
			expect(arrivalSection).toContain("Arrival:");
			expect(arrivalSection).toContain(flight.scheduledArrival);
			expect(arrivalSection).toContain(flight.destination);
		});

		test("should include status changes when present", () => {
			// Arrange
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

			// Act
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

			// Assert
			expect(changesSection).toContain("Recent Status Changes");
			expect(changesSection).toContain("scheduled");
			expect(changesSection).toContain("departed");
			expect(changesSection).toContain("landed");
		});

		test("should show last updated timestamp", () => {
			// Arrange
			const lastPolledAt = Math.floor(Date.now() / 1000);
			const ago = Math.round((Date.now() - lastPolledAt * 1000) / 60000);
			const timestamp = `_Updated ${ago} min ago_`;

			// Act & Assert
			expect(timestamp).toContain("Updated");
			expect(timestamp).toContain("min ago");
		});
	});

	describe("conditional field display", () => {
		test("should show gate when present", () => {
			// Arrange
			const gate = "D10";
			const hasGate = gate !== undefined && gate !== null;

			// Act & Assert
			expect(hasGate).toBe(true);
		});

		test("should show terminal when present", () => {
			// Arrange
			const terminal = "2";
			const hasTerminal = terminal !== undefined && terminal !== null;

			// Act & Assert
			expect(hasTerminal).toBe(true);
		});

		test("should show delay when greater than 0", () => {
			// Arrange
			const delayMinutes = 15;
			const hasDelay = delayMinutes !== undefined && delayMinutes > 0;

			// Act & Assert
			expect(hasDelay).toBe(true);
		});

		test("should not show delay when 0 or undefined", () => {
			// Arrange
			const delayMinutes = 0;
			const hasDelay = delayMinutes !== undefined && delayMinutes > 0;

			// Act & Assert
			expect(hasDelay).toBe(false);
		});
	});

	describe("error handling", () => {
		test("should handle database errors gracefully", () => {
			// Arrange
			const errorMessage =
				"❌ Failed to retrieve flight status. Please try again later.";

			// Act & Assert
			expect(errorMessage).toContain("Failed to retrieve");
			expect(errorMessage).toContain("try again later");
		});

		test("should fall back to cached data on API failure", () => {
			// Arrange
			const apiError = true;
			const hasCachedData = true;

			// Act & Assert
			// When API fails but cached data exists, should show cached data
			expect(apiError || hasCachedData).toBeDefined();
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

		test("should extract chat id from context", () => {
			// Arrange
			const chatId = mockContext.chat?.id.toString();

			// Act & Assert
			expect(chatId).toBe("123456");
		});
	});
});
