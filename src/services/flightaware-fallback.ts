import { logger } from "../utils/logger.js";

interface FlightAwareAirport {
	iata?: string;
}

interface FlightAwareTimes {
	scheduled?: number;
	estimated?: number;
}

interface FlightAwareFlight {
	origin?: FlightAwareAirport;
	destination?: FlightAwareAirport;
	flightStatus?: string;
	cancelled?: boolean;
	diverted?: boolean;
	gateDepartureTimes?: FlightAwareTimes;
	takeoffTimes?: FlightAwareTimes;
	landingTimes?: FlightAwareTimes;
	gateArrivalTimes?: FlightAwareTimes;
}

interface FlightAwareBootstrap {
	flights?: Record<string, FlightAwareFlight>;
}

export interface FlightAwareFallbackData {
	status?: string;
	delayMinutes?: number;
	source: "flightaware";
}

const FLIGHTAWARE_URL = "https://www.flightaware.com/live/flight";

function getDelayFromTimes(times?: FlightAwareTimes): number | undefined {
	if (!times?.estimated || !times?.scheduled) {
		return undefined;
	}

	const minutes = Math.round((times.estimated - times.scheduled) / 60);
	return minutes > 0 ? minutes : undefined;
}

function getDelayMinutes(flight: FlightAwareFlight): number | undefined {
	const candidates = [
		getDelayFromTimes(flight.gateDepartureTimes),
		getDelayFromTimes(flight.takeoffTimes),
		getDelayFromTimes(flight.landingTimes),
		getDelayFromTimes(flight.gateArrivalTimes),
	].filter((value): value is number => value !== undefined);

	if (candidates.length === 0) {
		return undefined;
	}

	return Math.max(...candidates);
}

function normalizeStatus(flight: FlightAwareFlight, delayMinutes?: number): string | undefined {
	if (flight.cancelled) {
		return "cancelled";
	}
	if (flight.diverted) {
		return "diverted";
	}
	if (flight.flightStatus && flight.flightStatus.trim().length > 0) {
		return flight.flightStatus.trim().toLowerCase();
	}
	if (delayMinutes && delayMinutes > 0) {
		return "delayed";
	}
	return undefined;
}

function parseBootstrap(html: string): FlightAwareBootstrap | undefined {
	const bootstrapMatch = html.match(/var\s+trackpollBootstrap\s*=\s*(\{[\s\S]*?\});<\/script>/);
	if (!bootstrapMatch) {
		return undefined;
	}

	try {
		return JSON.parse(bootstrapMatch[1]) as FlightAwareBootstrap;
	} catch (error) {
		logger.warn("Failed to parse FlightAware bootstrap payload:", error);
		return undefined;
	}
}

function selectFlight(
	flights: FlightAwareFlight[],
	origin: string,
	destination: string,
): FlightAwareFlight | undefined {
	return (
		flights.find((flight) => {
			return flight.origin?.iata === origin && flight.destination?.iata === destination;
		}) ?? flights[0]
	);
}

export async function getFlightAwareFallback(
	flightNumbers: string[],
	origin: string,
	destination: string,
): Promise<FlightAwareFallbackData | undefined> {
	for (const flightNumber of flightNumbers) {
		try {
			const normalizedFlight = flightNumber.replace(/\s+/g, "");
			if (normalizedFlight.length === 0) {
				continue;
			}

			const response = await fetch(`${FLIGHTAWARE_URL}/${normalizedFlight}`, {
				headers: {
					"user-agent": "Mozilla/5.0",
				},
			});
			if (!response.ok) {
				continue;
			}

			const html = await response.text();
			const bootstrap = parseBootstrap(html);
			if (!bootstrap?.flights) {
				continue;
			}

			const selected = selectFlight(Object.values(bootstrap.flights), origin, destination);
			if (!selected || (selected as { unknown?: boolean }).unknown) {
				continue;
			}

			const delayMinutes = getDelayMinutes(selected);
			const status = normalizeStatus(selected, delayMinutes);

			if (!status && !delayMinutes) {
				continue;
			}

			return {
				status,
				delayMinutes,
				source: "flightaware",
			};
		} catch (error) {
			logger.warn(`FlightAware fallback failed for ${flightNumber}:`, error);
		}
	}

	return undefined;
}
