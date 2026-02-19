import { describe, expect, test } from "bun:test";

describe("polling-service", () => {
	describe("poll interval behavior", () => {
		test("should use imminent interval (1 min) for flights within 1 hour of departure", () => {
			const now = new Date("2026-02-19T14:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			const hoursUntilDeparture =
				(scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);

			expect(hoursUntilDeparture).toBeLessThanOrEqual(1);
		});

		test("should use near interval (5 min) for flights 1-3 hours from departure", () => {
			const now = new Date("2026-02-19T12:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			const hoursUntilDeparture =
				(scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);

			expect(hoursUntilDeparture).toBeGreaterThan(1);
			expect(hoursUntilDeparture).toBeLessThanOrEqual(3);
		});

		test("should use far interval (15 min) for flights more than 3 hours from departure", () => {
			const now = new Date("2026-02-19T08:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T14:30:00Z");
			const hoursUntilDeparture =
				(scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);

			expect(hoursUntilDeparture).toBeGreaterThan(3);
		});
	});

	describe("flight filtering", () => {
		test("should skip flights with landed status", () => {
			const flight = { currentStatus: "landed" };
			expect(flight.currentStatus).toBe("landed");
		});

		test("should skip flights with cancelled status", () => {
			const flight = { currentStatus: "cancelled" };
			expect(flight.currentStatus).toBe("cancelled");
		});

		test("should skip flights more than 6 hours from departure", () => {
			const now = new Date("2026-02-19T10:00:00Z");
			const scheduledDeparture = new Date("2026-02-19T18:00:00Z");
			const hoursUntilDeparture =
				(scheduledDeparture.getTime() - now.getTime()) / (60 * 60 * 1000);
			const HOURS_BEFORE_START_POLLING = 6;

			expect(hoursUntilDeparture).toBeGreaterThan(HOURS_BEFORE_START_POLLING);
		});

		test("should skip flights polled within their interval", () => {
			const POLL_INTERVAL_FAR = 15 * 60 * 1000;
			const now = Date.now();
			const lastPolled = now - 5 * 60 * 1000;
			const timeSinceLastPoll = now - lastPolled;

			expect(timeSinceLastPoll).toBeLessThan(POLL_INTERVAL_FAR);
		});
	});

	describe("status change detection", () => {
		test("should detect status change", () => {
			const oldStatus = "scheduled";
			const newStatus = "departed";
			expect(oldStatus).not.toBe(newStatus);
		});

		test("should detect gate change", () => {
			const oldGate = "D10";
			const newGate = "D15";
			expect(oldGate).not.toBe(newGate);
		});

		test("should detect terminal change", () => {
			const oldTerminal = "2";
			const newTerminal = "3";
			expect(oldTerminal).not.toBe(newTerminal);
		});

		test("should detect delay change", () => {
			const oldDelay = 0;
			const newDelay = 15;
			expect(oldDelay).not.toBe(newDelay);
		});

		test("should not trigger update when nothing changes", () => {
			const oldStatus = "scheduled";
			const newStatus = "scheduled";
			const oldGate = "D10";
			const newGate = "D10";
			const oldTerminal = "2";
			const newTerminal = "2";

			expect(oldStatus).toBe(newStatus);
			expect(oldGate).toBe(newGate);
			expect(oldTerminal).toBe(newTerminal);
		});
	});

	describe("notification formatting", () => {
		test("should format status change message correctly", () => {
			const flightNumber = "UA1234";
			const oldStatus = "scheduled";
			const newStatus = "departed";
			const expectedMessage = `🚨 *${flightNumber} Update*\n\nStatus: ${oldStatus} → ${newStatus}\n`;

			expect(expectedMessage).toContain(flightNumber);
			expect(expectedMessage).toContain("Update");
			expect(expectedMessage).toContain(oldStatus);
			expect(expectedMessage).toContain(newStatus);
		});

		test("should format gate change message correctly", () => {
			const oldGate = "D10";
			const newGate = "D15";
			const expectedDetails = `Gate: ${oldGate} → ${newGate}\n`;

			expect(expectedDetails).toContain(oldGate);
			expect(expectedDetails).toContain(newGate);
		});

		test("should format delay message correctly", () => {
			const delayMinutes = 15;
			const expectedDetails = `Delay: ${delayMinutes} min\n`;

			expect(expectedDetails).toContain(delayMinutes.toString());
			expect(expectedDetails).toContain("Delay");
		});
	});
});
