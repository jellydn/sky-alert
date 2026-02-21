import type { AviationstackFlight } from "../services/aviationstack.js";
import { normalizeOperationalStatus } from "./flight-status.js";
import { formatTime } from "./format-time.js";

export function formatFlightListMessage(
	flights: AviationstackFlight[],
	flightNumber?: string,
): string {
	const limited = flights.slice(0, 5);
	const header = flightNumber
		? `✈️ *Found ${limited.length} flights for ${flightNumber}*`
		: `✈️ *Found ${limited.length} flight(s)*`;

	let message = `${header}\n\n`;

	for (let i = 0; i < limited.length; i++) {
		const f = limited[i];
		const timeStr = formatTime(f.departure.scheduled);

		if (flightNumber) {
			message += `${i + 1}. ${f.departure.iata} → ${f.arrival.iata}\n`;
			message += `   🛫 ${timeStr}`;
			if (f.departure.terminal) message += ` Terminal ${f.departure.terminal}`;
			message += `\n   📊 ${normalizeOperationalStatus(f.flight_status, f.departure.scheduled) || "unknown"}\n\n`;
		} else {
			message += `${i + 1}. *${f.flight.iata}*\n`;
			message += `   ${f.airline.name}\n`;
			message += `   ${timeStr}\n\n`;
		}
	}

	message += "Reply with the number (1-5) to track a flight.";
	return message;
}
