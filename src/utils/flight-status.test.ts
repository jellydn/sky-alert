import { describe, expect, test } from "bun:test";
import {
	isLowSignalStatus,
	isTerminalFlightStatus,
	normalizeFlightStatus,
	preferKnownStatus,
	shouldUseStatusFallback,
} from "./flight-status.js";

describe("flight-status utilities", () => {
	test("normalizeFlightStatus returns lowercase trimmed value", () => {
		expect(normalizeFlightStatus("  Departed ")).toBe("departed");
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
