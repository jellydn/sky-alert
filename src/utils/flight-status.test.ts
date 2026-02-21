import { describe, expect, test } from "bun:test";
import {
	isLowSignalStatus,
	isTerminalFlightStatus,
	normalizeFlightStatus,
	normalizeOperationalStatus,
	preferKnownStatus,
	shouldUseDepartureStandInfo,
	shouldUseStatusFallback,
} from "./flight-status.js";

describe("flight-status utilities", () => {
	test("normalizeFlightStatus returns lowercase trimmed value", () => {
		expect(normalizeFlightStatus("  Departed ")).toBe("departed");
	});

	test("normalizeFlightStatus maps known aliases", () => {
		expect(normalizeFlightStatus("canceled")).toBe("cancelled");
		expect(normalizeFlightStatus("in-air")).toBe("departed");
	});

	test("normalizeOperationalStatus maps future active flight to scheduled", () => {
		const nowMs = Date.parse("2026-02-21T00:00:00Z");
		expect(
			normalizeOperationalStatus("active", "2026-02-22T19:55:00+00:00", undefined, nowMs),
		).toBe("scheduled");
	});

	test("normalizeOperationalStatus keeps active for past departure", () => {
		const nowMs = Date.parse("2026-02-22T21:00:00Z");
		expect(
			normalizeOperationalStatus("active", "2026-02-22T19:55:00+00:00", undefined, nowMs),
		).toBe("active");
	});

	test("normalizeOperationalStatus maps future landed flight to scheduled", () => {
		const nowMs = Date.parse("2026-02-21T00:00:00Z");
		expect(
			normalizeOperationalStatus("landed", "2026-02-22T19:55:00+00:00", undefined, nowMs),
		).toBe("scheduled");
	});

	test("normalizeOperationalStatus keeps cancelled for future departures", () => {
		const nowMs = Date.parse("2026-02-21T00:00:00Z");
		expect(
			normalizeOperationalStatus("cancelled", "2026-02-22T19:55:00+00:00", undefined, nowMs),
		).toBe("cancelled");
	});

	test("normalizeOperationalStatus maps progress status to scheduled for future tracked date", () => {
		const nowMs = Date.parse("2026-02-21T10:00:00Z");
		expect(
			normalizeOperationalStatus("arrived", "2026-02-21T19:55:00+00:00", "2026-02-22", nowMs),
		).toBe("scheduled");
	});

	test("shouldUseDepartureStandInfo is false for far future departures", () => {
		const nowMs = Date.parse("2026-02-21T00:00:00Z");
		expect(
			shouldUseDepartureStandInfo("2026-02-22T19:55:00+00:00", undefined, undefined, nowMs),
		).toBe(false);
	});

	test("shouldUseDepartureStandInfo is true for near departures", () => {
		const nowMs = Date.parse("2026-02-22T15:00:00Z");
		expect(
			shouldUseDepartureStandInfo("2026-02-22T19:55:00+00:00", undefined, undefined, nowMs),
		).toBe(true);
	});

	test("shouldUseDepartureStandInfo is false when tracked flight date is tomorrow", () => {
		const nowMs = Date.parse("2026-02-21T10:00:00Z");
		expect(
			shouldUseDepartureStandInfo("2026-02-21T19:55:00+00:00", "2026-02-22", undefined, nowMs),
		).toBe(false);
	});

	test("shouldUseDepartureStandInfo is false for scheduled status", () => {
		const nowMs = Date.parse("2026-02-22T18:00:00Z");
		expect(
			shouldUseDepartureStandInfo("2026-02-22T19:55:00+00:00", "2026-02-22", "scheduled", nowMs),
		).toBe(false);
	});

	test("isLowSignalStatus treats unknown as low-signal", () => {
		expect(isLowSignalStatus("unknown")).toBe(true);
	});

	test("shouldUseStatusFallback when low-signal and no delay", () => {
		expect(shouldUseStatusFallback("scheduled", undefined)).toBe(true);
	});

	test("shouldUseStatusFallback is false when delay is positive", () => {
		expect(shouldUseStatusFallback("scheduled", 20)).toBe(false);
	});

	test("preferKnownStatus avoids downgrading known status to unknown", () => {
		expect(preferKnownStatus("scheduled", "unknown")).toBe("scheduled");
		expect(preferKnownStatus("departed", "unknown")).toBe("departed");
	});

	test("preferKnownStatus accepts stronger candidate status", () => {
		expect(preferKnownStatus("scheduled", "departed")).toBe("departed");
	});

	test("isTerminalFlightStatus handles known terminal statuses", () => {
		expect(isTerminalFlightStatus("landed")).toBe(true);
		expect(isTerminalFlightStatus(" Cancelled ")).toBe(true);
		expect(isTerminalFlightStatus("arrived")).toBe(true);
		expect(isTerminalFlightStatus("scheduled")).toBe(false);
	});
});
