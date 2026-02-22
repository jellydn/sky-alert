const MONTH_ABBRS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function to12Hour(hours: number): { displayHours: number; period: "AM" | "PM" } {
	const period = hours >= 12 ? "PM" : "AM";
	const displayHours = hours % 12 || 12;
	return { displayHours, period };
}

/**
 * Format an ISO 8601 string to time in 12-hour format.
 * Extracts time directly from the string to preserve original timezone.
 * e.g. "2026-02-19T01:35:00+07:00" → "01:35 AM"
 */
export function formatTime(isoString: string): string {
	const timeMatch = isoString.match(/T(\d{2}):(\d{2})/);
	if (!timeMatch) return "--:--";

	const hours = parseInt(timeMatch[1], 10);
	const minutes = timeMatch[2];
	const { displayHours, period } = to12Hour(hours);

	return `${displayHours}:${minutes} ${period}`;
}

export function formatDateTime(isoString: string): string {
	const timeMatch = isoString.match(/T(\d{2}):(\d{2})/);
	const [datePart] = isoString.split("T");
	if (!timeMatch || !datePart) return "---";

	const [_year, month, day] = datePart.split("-");
	const hours = parseInt(timeMatch[1], 10);
	const minutes = timeMatch[2];
	const { displayHours, period } = to12Hour(hours);

	return `${MONTH_ABBRS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${displayHours}:${minutes} ${period}`;
}

export function formatDateTimeForFlightDate(isoString: string, flightDate?: string): string {
	const timeMatch = isoString.match(/T(\d{2}):(\d{2})/);
	if (!timeMatch) return "---";

	const displayDate = flightDate ?? isoString.split("T")[0];
	if (!displayDate) return "---";

	const [_year, month, day] = displayDate.split("-");
	if (!month || !day) return "---";

	const hours = parseInt(timeMatch[1], 10);
	const minutes = timeMatch[2];
	const { displayHours, period } = to12Hour(hours);

	return `${MONTH_ABBRS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${displayHours}:${minutes} ${period}`;
}
