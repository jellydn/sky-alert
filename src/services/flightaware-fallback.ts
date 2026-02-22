import { logger } from "../utils/logger.js";

interface FlightAwareAirport {
	iata?: string;
	gate?: string | null;
	terminal?: string | null;
}

interface FlightAwareTimes {
	scheduled?: number;
	estimated?: number;
}

interface FlightAwareFlight {
	origin?: FlightAwareAirport;
	destination?: FlightAwareAirport;
	activityLog?: {
		flights?: FlightAwareFlight[];
	};
	flightStatus?: string;
	cancelled?: boolean;
	diverted?: boolean;
	unknown?: boolean;
	resultUnknown?: boolean;
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
	departureGate?: string;
	departureTerminal?: string;
	arrivalGate?: string;
	arrivalTerminal?: string;
	url?: string;
	source: "flightaware";
}

const FLIGHTAWARE_URL = "https://www.flightaware.com/live/flight";
const ACTIVITY_MATCH_WINDOW_MS = 18 * 60 * 60 * 1000;

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

function getBestScheduledSeconds(flight: FlightAwareFlight): number | undefined {
	return (
		flight.gateDepartureTimes?.scheduled ||
		flight.takeoffTimes?.scheduled ||
		flight.gateArrivalTimes?.scheduled ||
		flight.landingTimes?.scheduled
	);
}

function getSignalScore(flight: FlightAwareFlight): number {
	let score = 0;
	const delayMinutes = getDelayMinutes(flight);
	if (delayMinutes && delayMinutes > 0) {
		score += 3;
	}
	if (flight.flightStatus && flight.flightStatus.trim().length > 0) {
		score += 2;
	}
	if (flight.origin?.gate) {
		score += 1;
	}
	if (flight.origin?.terminal) {
		score += 1;
	}
	if (flight.destination?.gate) {
		score += 1;
	}
	if (flight.destination?.terminal) {
		score += 1;
	}

	return score;
}

function selectBestActivityFlight(
	flight: FlightAwareFlight,
	origin: string,
	destination: string,
	scheduledDepartureIso?: string,
): FlightAwareFlight {
	const candidates = (flight.activityLog?.flights || []).filter(
		(candidate) => candidate.origin?.iata === origin && candidate.destination?.iata === destination,
	);
	if (candidates.length === 0) {
		return flight;
	}

	const scheduledDepartureMs = scheduledDepartureIso
		? Date.parse(scheduledDepartureIso)
		: Number.NaN;
	const scopedCandidates =
		!Number.isNaN(scheduledDepartureMs) && scheduledDepartureMs > 0
			? candidates.filter((candidate) => {
					const scheduledSeconds = getBestScheduledSeconds(candidate);
					if (!scheduledSeconds) {
						return false;
					}
					return (
						Math.abs(scheduledSeconds * 1000 - scheduledDepartureMs) <= ACTIVITY_MATCH_WINDOW_MS
					);
				})
			: [];

	const rankedCandidates = scopedCandidates.length > 0 ? scopedCandidates : candidates;
	return rankedCandidates.sort((a, b) => {
		const scoreDelta = getSignalScore(b) - getSignalScore(a);
		if (scoreDelta !== 0) {
			return scoreDelta;
		}

		if (!Number.isNaN(scheduledDepartureMs)) {
			const aSeconds = getBestScheduledSeconds(a);
			const bSeconds = getBestScheduledSeconds(b);
			if (aSeconds && bSeconds) {
				return (
					Math.abs(aSeconds * 1000 - scheduledDepartureMs) -
					Math.abs(bSeconds * 1000 - scheduledDepartureMs)
				);
			}
			if (aSeconds) {
				return -1;
			}
			if (bSeconds) {
				return 1;
			}
		}

		return 0;
	})[0];
}

export async function getFlightAwareFallback(
	flightNumbers: string[],
	origin: string,
	destination: string,
	scheduledDepartureIso?: string,
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
			if (!selected || selected.unknown || selected.resultUnknown) {
				continue;
			}
			const selectedActivity = selectBestActivityFlight(
				selected,
				origin,
				destination,
				scheduledDepartureIso,
			);

			const delayMinutes = getDelayMinutes(selectedActivity);
			const status = normalizeStatus(selectedActivity, delayMinutes);

			if (
				!status &&
				!delayMinutes &&
				!selectedActivity.origin?.gate &&
				!selectedActivity.origin?.terminal &&
				!selectedActivity.destination?.gate &&
				!selectedActivity.destination?.terminal
			) {
				continue;
			}

			return {
				status,
				delayMinutes,
				departureGate: selectedActivity.origin?.gate || undefined,
				departureTerminal: selectedActivity.origin?.terminal || undefined,
				arrivalGate: selectedActivity.destination?.gate || undefined,
				arrivalTerminal: selectedActivity.destination?.terminal || undefined,
				url: `${FLIGHTAWARE_URL}/${normalizedFlight}`,
				source: "flightaware",
			};
		} catch (error) {
			logger.warn(`FlightAware fallback failed for ${flightNumber}:`, error);
		}
	}

	return undefined;
}
