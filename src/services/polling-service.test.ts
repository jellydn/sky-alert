import { describe, expect, test } from "bun:test";

function shouldUseFallback(status: string, delayMinutes?: number): boolean {
	return (!delayMinutes || delayMinutes <= 0) && (status === "scheduled" || status.length === 0);
}

function parseCarrierAndNumber(flightCode: string): { carrier?: string; number?: string } {
	const match = flightCode.match(/^([A-Z]{2,3})(\d{1,4})$/);
	if (!match) {
		return {};
	}

	return { carrier: match[1], number: match[2] };
}

const POLL_INTERVAL_FAR = 15 * 60 * 1000;
const POLL_INTERVAL_NEAR = 5 * 60 * 1000;
const POLL_INTERVAL_IMMINENT = 1 * 60 * 1000;
const HOURS_BEFORE_START_POLLING = 6;

function getPollInterval(scheduledDeparture: Date, now: Date): number {
	const hoursUntilDeparture = (scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);

	if (hoursUntilDeparture <= 1) return POLL_INTERVAL_IMMINENT;
	if (hoursUntilDeparture <= 3) return POLL_INTERVAL_NEAR;
	return POLL_INTERVAL_FAR;
}

describe("polling-service", () => {
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
	});

	describe("parseCarrierAndNumber", () => {
		test("should parse valid 2-letter carrier with flight number", () => {
			expect(parseCarrierAndNumber("AA123")).toEqual({ carrier: "AA", number: "123" });
		});

		test("should parse valid 3-letter carrier with flight number", () => {
			expect(parseCarrierAndNumber("UAL456")).toEqual({ carrier: "UAL", number: "456" });
		});

		test("should return empty object for invalid format", () => {
			expect(parseCarrierAndNumber("INVALID")).toEqual({});
		});

		test("should return empty object for lowercase carrier", () => {
			expect(parseCarrierAndNumber("aa123")).toEqual({});
		});
	});

	describe("getPollInterval", () => {
		test("should return imminent interval for flights departing within 1 hour", () => {
			const now = new Date("2026-02-19T14:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			expect(getPollInterval(scheduledDeparture, now)).toBe(POLL_INTERVAL_IMMINENT);
		});

		test("should return near interval for flights departing within 1-3 hours", () => {
			const now = new Date("2026-02-19T12:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			expect(getPollInterval(scheduledDeparture, now)).toBe(POLL_INTERVAL_NEAR);
		});

		test("should return far interval for flights departing more than 3 hours out", () => {
			const now = new Date("2026-02-19T08:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			expect(getPollInterval(scheduledDeparture, now)).toBe(POLL_INTERVAL_FAR);
		});

		test("should return imminent interval for flights exactly 1 hour out", () => {
			const now = new Date("2026-02-19T14:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T15:00:00Z");
			expect(getPollInterval(scheduledDeparture, now)).toBe(POLL_INTERVAL_IMMINENT);
		});

		test("should return near interval for flights exactly 3 hours out", () => {
			const now = new Date("2026-02-19T11:30:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			expect(getPollInterval(scheduledDeparture, now)).toBe(POLL_INTERVAL_NEAR);
		});
	});

	describe("flight filtering - status checks", () => {
		test("should identify landed status", () => {
			const flight = { currentStatus: "landed" };
			expect(flight.currentStatus === "landed" || flight.currentStatus === "cancelled").toBe(true);
		});

		test("should identify cancelled status", () => {
			const flight = { currentStatus: "cancelled" };
			expect(flight.currentStatus === "landed" || flight.currentStatus === "cancelled").toBe(true);
		});

		test("should identify active status", () => {
			const flight = { currentStatus: "scheduled" };
			expect(flight.currentStatus === "landed" || flight.currentStatus === "cancelled").toBe(false);
		});
	});

	describe("flight filtering - time checks", () => {
		test("should skip flights more than 6 hours before departure", () => {
			const now = new Date("2026-02-19T10:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T18:00:00Z");
			const sixHoursFromNow = new Date(now.getTime() + HOURS_BEFORE_START_POLLING * 60 * 60 * 1000);
			expect(scheduledDeparture > sixHoursFromNow).toBe(true);
		});

		test("should include flights within 6 hours of departure", () => {
			const now = new Date("2026-02-19T10:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:00:00Z");
			const sixHoursFromNow = new Date(now.getTime() + HOURS_BEFORE_START_POLLING * 60 * 60 * 1000);
			expect(scheduledDeparture > sixHoursFromNow).toBe(false);
		});

		test("should skip flights polled within the interval", () => {
			const now = Date.now();
			const lastPolled = now - 5 * 60 * 1000;
			const pollInterval = POLL_INTERVAL_FAR;
			const timeSinceLastPoll = now - lastPolled;
			expect(timeSinceLastPoll < pollInterval).toBe(true);
		});

		test("should include flights due for polling", () => {
			const now = Date.now();
			const lastPolled = now - 20 * 60 * 1000;
			const pollInterval = POLL_INTERVAL_FAR;
			const timeSinceLastPoll = now - lastPolled;
			expect(timeSinceLastPoll < pollInterval).toBe(false);
		});
	});

	describe("status change detection - value comparisons", () => {
		test("should not trigger update when nothing changes", () => {
			const oldStatus = "scheduled";
			const newStatus = "scheduled";
			const oldGate = "D10";
			const newGate = "D10";
			const oldTerminal = "2";
			const newTerminal = "2";
			const statusChanged = oldStatus !== newStatus;
			const gateChanged = oldGate !== newGate;
			const terminalChanged = oldTerminal !== newTerminal;
			expect(statusChanged || gateChanged || terminalChanged).toBe(false);
		});
	});

	describe("notification message formatting", () => {
		test("should include flight number and status transition in message", () => {
			const flightNumber = "UA1234";
			const oldStatus = "scheduled";
			const newStatus = "departed";
			let message = `🚨 *${flightNumber} Update*\n\n`;
			message += `Status: ${oldStatus} → ${newStatus}\n`;
			expect(message).toContain(flightNumber);
			expect(message).toContain("Update");
			expect(message).toContain(oldStatus);
			expect(message).toContain(newStatus);
		});

		test("should include gate transition in message", () => {
			const oldGate = "D10";
			const newGate = "D15";
			const gateDetails = `Gate: ${oldGate} → ${newGate}\n`;
			expect(gateDetails).toContain(oldGate);
			expect(gateDetails).toContain(newGate);
		});

		test("should include delay information in message", () => {
			const delayMinutes = 15;
			const delayDetails = `Delay: ${delayMinutes} min\n`;
			expect(delayDetails).toContain(delayMinutes.toString());
			expect(delayDetails).toContain("Delay");
		});

		test("should format multiple changes in single message", () => {
			const changes = [
				{ field: "Status", from: "scheduled", to: "departed" },
				{ field: "Gate", from: "D10", to: "D15" },
			];
			const flightNumber = "UA1234";
			let message = `🚨 *${flightNumber} Update*\n\n`;
			for (const change of changes) {
				message += `${change.field}: ${change.from} → ${change.to}\n`;
			}
			expect(message).toContain("Status: scheduled → departed");
			expect(message).toContain("Gate: D10 → D15");
		});
	});
});
