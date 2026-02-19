/**
 * Format an ISO 8601 string preserving its embedded timezone offset.
 * e.g. "2026-02-19T17:35:00+00:00" → "05:35 PM" (in UTC+0, not local time)
 */
export function formatTime(isoString: string): string {
	const date = new Date(isoString);
	const offsetMinutes = parseOffsetMinutes(isoString);
	const localMs = date.getTime() + offsetMinutes * 60_000;
	const localDate = new Date(localMs);
	return localDate.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
		timeZone: "UTC",
	});
}

export function formatDateTime(isoString: string): string {
	const date = new Date(isoString);
	const offsetMinutes = parseOffsetMinutes(isoString);
	const localMs = date.getTime() + offsetMinutes * 60_000;
	const localDate = new Date(localMs);
	return localDate.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
		timeZone: "UTC",
	});
}

/**
 * Extract the UTC offset in minutes from an ISO 8601 string.
 * Handles "+HH:MM", "-HH:MM", and "Z" (treated as +00:00).
 * Falls back to 0 if no offset is found.
 */
function parseOffsetMinutes(isoString: string): number {
	// Match trailing Z or ±HH:MM / ±HHMM
	const match = isoString.match(/([+-])(\d{2}):?(\d{2})$|Z$/);
	if (!match) return 0;
	if (match[0] === "Z") return 0;
	const sign = match[1] === "+" ? 1 : -1;
	const hours = parseInt(match[2], 10);
	const minutes = parseInt(match[3], 10);
	return sign * (hours * 60 + minutes);
}
