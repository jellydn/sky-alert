export interface ParsedFlightInput {
	flightNumber: string | null;
	date: string | null;
	origin?: string;
	destination?: string;
	isRoute: boolean;
}

const FLIGHT_NUMBER_PATTERN = /([A-Za-z]{1,3}\d{1,4})/;
const ROUTE_PATTERN = /([A-Z]{3})\s*(?:to|TO|→|-)\s*([A-Z]{3})/i;

export function parseFlightInput(message: string): ParsedFlightInput {
	const cleanedMessage = message.trim();

	const flightNumberMatch = cleanedMessage.match(FLIGHT_NUMBER_PATTERN);
	const routeMatch = cleanedMessage.match(ROUTE_PATTERN);

	const flightNumber = flightNumberMatch
		? flightNumberMatch[1].toUpperCase()
		: null;
	const isRoute = routeMatch !== null;

	const result: ParsedFlightInput = {
		flightNumber,
		date: parseDate(cleanedMessage),
		isRoute,
	};

	if (isRoute && routeMatch) {
		result.origin = routeMatch[1].toUpperCase();
		result.destination = routeMatch[2].toUpperCase();
	}

	return result;
}

function parseDate(message: string): string | null {
	const lowerMessage = message.toLowerCase();

	const now = new Date();

	if (lowerMessage.includes("today")) {
		return formatDate(now);
	}

	if (lowerMessage.includes("tomorrow")) {
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);
		return formatDate(tomorrow);
	}

	const isoDateMatch = message.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (isoDateMatch) {
		const [, year, month, day] = isoDateMatch;
		return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	}

	const slashDateMatch = message.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
	if (slashDateMatch) {
		const [, day, month, year] = slashDateMatch;
		return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	}

	const slashDateMatchShort = message.match(
		/(\d{1,2})[/-](\d{1,2})[/-](\d{2})/,
	);
	if (slashDateMatchShort) {
		const [, day, month, year] = slashDateMatchShort;
		const fullYear = parseInt(year, 10) < 50 ? `20${year}` : `19${year}`;
		return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	}

	const monthNames = [
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december",
	];

	for (let i = 0; i < monthNames.length; i++) {
		if (lowerMessage.includes(monthNames[i])) {
			const dayMatch = lowerMessage.match(
				new RegExp(`${monthNames[i]}\\s*(\\d{1,2})`),
			);
			if (dayMatch) {
				const yearMatch = lowerMessage.match(/(\d{4})/);
				const year = yearMatch ? yearMatch[1] : now.getFullYear();
				return `${year}-${String(i + 1).padStart(2, "0")}-${dayMatch[1].padStart(2, "0")}`;
			}
		}
	}

	const dayNames = [
		"sunday",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
	];

	if (lowerMessage.includes("next ")) {
		const nextDay = lowerMessage.match(/next\s+(\w+)/i);
		if (nextDay) {
			const dayName = nextDay[1].toLowerCase();
			const dayIndex = dayNames.indexOf(dayName);
			if (dayIndex !== -1) {
				const nextDate = getNextDayOfWeek(now, dayIndex);
				return formatDate(nextDate);
			}
		}
	}

	return null;
}

function formatDate(date: Date): string {
	return date.toISOString().split("T")[0];
}

function getNextDayOfWeek(date: Date, dayIndex: number): Date {
	const result = new Date(date);
	const currentDayIndex = result.getDay();
	let daysUntilNextDay = dayIndex - currentDayIndex;
	if (daysUntilNextDay <= 0) {
		daysUntilNextDay += 7;
	}
	result.setDate(result.getDate() + daysUntilNextDay);
	return result;
}
