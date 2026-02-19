import { describe, expect, test } from "bun:test";
import { formatDateTime, formatTime } from "./format-time.js";

describe("formatTime", () => {
	test("should format UTC+7 time correctly", () => {
		expect(formatTime("2026-02-19T01:35:00+07:00")).toBe("1:35 AM");
	});

	test("should format UTC time correctly", () => {
		expect(formatTime("2026-02-19T17:35:00+00:00")).toBe("5:35 PM");
	});

	test("should format UTC-5 time correctly", () => {
		expect(formatTime("2026-02-19T10:30:00-05:00")).toBe("10:30 AM");
	});

	test("should format midnight correctly", () => {
		expect(formatTime("2026-02-19T00:00:00+07:00")).toBe("12:00 AM");
	});

	test("should format noon correctly", () => {
		expect(formatTime("2026-02-19T12:00:00+07:00")).toBe("12:00 PM");
	});

	test("should return --:-- for invalid string", () => {
		expect(formatTime("invalid")).toBe("--:--");
	});
});

describe("formatDateTime", () => {
	test("should format date and time correctly", () => {
		expect(formatDateTime("2026-02-19T01:35:00+07:00")).toBe("Feb 19, 1:35 AM");
	});

	test("should format PM time correctly", () => {
		expect(formatDateTime("2026-03-15T14:30:00+00:00")).toBe("Mar 15, 2:30 PM");
	});

	test("should return --- for invalid string", () => {
		expect(formatDateTime("invalid")).toBe("---");
	});
});
