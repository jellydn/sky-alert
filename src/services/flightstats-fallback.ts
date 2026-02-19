import { logger } from "../utils/logger.js";

interface FlightStatsSchedule {
	estimatedActualDeparture?: string | null;
	estimatedActualArrival?: string | null;
}

interface FlightStatsDelay {
	departure?: { minutes?: number };
	arrival?: { minutes?: number };
}

interface FlightStatsStatus {
	status?: string;
	delay?: FlightStatsDelay;
}

interface FlightStatsAirport {
	terminal?: string | null;
	gate?: string | null;
}

interface FlightStatsFlight {
	schedule?: FlightStatsSchedule;
	status?: FlightStatsStatus;
	departureAirport?: FlightStatsAirport;
	arrivalAirport?: FlightStatsAirport;
}

interface FlightStatsNextData {
	props?: {
		initialState?: {
			flightTracker?: {
				flight?: FlightStatsFlight;
			};
		};
	};
}

export interface FlightStatsFallbackData {
	status?: string;
	delayMinutes?: number;
	estimatedDeparture?: string;
	estimatedArrival?: string;
	departureTerminal?: string;
	departureGate?: string;
	arrivalTerminal?: string;
	arrivalGate?: string;
	source: "flightstats";
}

function parseNextData(html: string): FlightStatsNextData | undefined {
	const nextDataMatch = html.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});__NEXT_LOADED_PAGES__/);
	if (!nextDataMatch) {
		return undefined;
	}

	try {
		return JSON.parse(nextDataMatch[1]) as FlightStatsNextData;
	} catch (error) {
		logger.warn("Failed to parse FlightStats NEXT_DATA payload:", error);
		return undefined;
	}
}

function normalizeStatus(status?: string): string | undefined {
	if (!status) {
		return undefined;
	}

	return status.trim().toLowerCase();
}

export async function getFlightStatsFallback(
	carrierCode: string,
	flightNumber: string,
): Promise<FlightStatsFallbackData | undefined> {
	try {
		const response = await fetch(
			`https://www.flightstats.com/v2/flight-tracker/${carrierCode}/${flightNumber}`,
			{
				headers: {
					"user-agent": "Mozilla/5.0",
				},
			},
		);
		if (!response.ok) {
			return undefined;
		}

		const html = await response.text();
		const nextData = parseNextData(html);
		const flight = nextData?.props?.initialState?.flightTracker?.flight;
		if (!flight) {
			return undefined;
		}

		const departureDelay = flight.status?.delay?.departure?.minutes ?? 0;
		const arrivalDelay = flight.status?.delay?.arrival?.minutes ?? 0;
		const delayMinutes = Math.max(departureDelay, arrivalDelay);

		return {
			status: normalizeStatus(flight.status?.status),
			delayMinutes: delayMinutes > 0 ? delayMinutes : undefined,
			estimatedDeparture: flight.schedule?.estimatedActualDeparture || undefined,
			estimatedArrival: flight.schedule?.estimatedActualArrival || undefined,
			departureTerminal: flight.departureAirport?.terminal || undefined,
			departureGate: flight.departureAirport?.gate || undefined,
			arrivalTerminal: flight.arrivalAirport?.terminal || undefined,
			arrivalGate: flight.arrivalAirport?.gate || undefined,
			source: "flightstats",
		};
	} catch (error) {
		logger.warn(`FlightStats fallback failed for ${carrierCode}${flightNumber}:`, error);
		return undefined;
	}
}
