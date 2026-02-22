import { logger } from "../utils/logger.js";

export interface AviationstackFlight {
	flight_date: string;
	flight_status: string;
	departure: {
		airport: string;
		timezone: string;
		iata: string;
		icao: string;
		terminal: string;
		gate: string;
		delay: number;
		scheduled: string;
		estimated: string;
		actual: string;
		estimated_runway: string;
		actual_runway: string;
	};
	arrival: {
		airport: string;
		timezone: string;
		iata: string;
		icao: string;
		terminal: string;
		gate: string;
		baggage: string;
		delay: number;
		scheduled: string;
		estimated: string;
		actual: string;
		estimated_runway: string;
		actual_runway: string;
	};
	airline: {
		name: string;
		iata: string;
		icao: string;
	};
	flight: {
		number: string;
		iata: string;
		icao: string;
	};
	aircraft: {
		registration: string;
		iata: string;
		icao: string;
		icao24: string;
	};
	live?: {
		latitude: number;
		longitude: number;
		altitude: number;
		direction: number;
	};
}

export interface AviationstackResponse {
	pagination: {
		limit: number;
		offset: number;
		count: number;
		total: number;
	};
	data: AviationstackFlight[];
}

const API_BASE_URL = "https://api.aviationstack.com/v1";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

interface FlightQueryOptions {
	bypassCache?: boolean;
	allowReserve?: boolean;
}

function formatDateInTimeZone(isoString: string, timezone?: string): string | null {
	const date = new Date(isoString);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	if (!timezone) {
		return isoString.split("T")[0] ?? null;
	}

	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const parts = formatter.formatToParts(date);
		const year = parts.find((part) => part.type === "year")?.value;
		const month = parts.find((part) => part.type === "month")?.value;
		const day = parts.find((part) => part.type === "day")?.value;

		if (!year || !month || !day) {
			return null;
		}

		return `${year}-${month}-${day}`;
	} catch {
		return isoString.split("T")[0] ?? null;
	}
}

export function flightMatchesRequestedDate(
	flight: AviationstackFlight,
	requestedDate: string,
): boolean {
	if (flight.flight_date === requestedDate) {
		return true;
	}

	const departureLocalDate = formatDateInTimeZone(
		flight.departure.scheduled,
		flight.departure.timezone,
	);
	if (departureLocalDate === requestedDate) {
		return true;
	}

	const arrivalLocalDate = formatDateInTimeZone(flight.arrival.scheduled, flight.arrival.timezone);
	return arrivalLocalDate === requestedDate;
}

export class AviationstackAPI {
	private apiKey: string;
	private cache = new Map<string, CacheEntry<unknown>>();

	constructor() {
		this.apiKey = process.env.AVIATIONSTACK_API_KEY || "";
		if (!this.apiKey) {
			throw new Error("AVIATIONSTACK_API_KEY environment variable is required");
		}
	}

	private getCached<T>(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;
		if (Date.now() - entry.timestamp > CACHE_TTL) {
			this.cache.delete(key);
			return undefined;
		}

		// Refresh insertion order on reads to make eviction LRU by access.
		this.cache.delete(key);
		this.cache.set(key, entry);
		return entry.data as T;
	}

	private setCache<T>(key: string, data: T): void {
		if (this.cache.size >= MAX_CACHE_ENTRIES) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}
		this.cache.set(key, { data, timestamp: Date.now() });
	}

	private async fetchWithBudget(
		url: URL,
		options?: FlightQueryOptions,
	): Promise<AviationstackResponse> {
		const { canMakeRequest, markUsageLimitReached, recordRequest } = await import(
			"./api-budget.js"
		);

		if (!(await canMakeRequest({ allowReserve: options?.allowReserve }))) {
			throw new Error("Monthly API budget exceeded");
		}

		const requestUrl = url.toString();
		logger.debug(`API request: ${requestUrl.replace(this.apiKey, "***")}`);
		const response = await fetch(requestUrl);

		if (!response.ok) {
			const body = await response.text();
			logger.error(`API error ${response.status}: ${body}`);
			if (response.status === 429) {
				await markUsageLimitReached();
				throw new Error("Monthly API budget exceeded");
			}
			if (response.status === 401) {
				throw new Error("Invalid API key");
			}
			throw new Error(`API request failed: ${response.status}`);
		}

		await recordRequest();

		return (await response.json()) as AviationstackResponse;
	}

	async getFlightsByNumber(
		flightNumber: string,
		date: string,
		options?: FlightQueryOptions,
	): Promise<AviationstackFlight[]> {
		const cacheKey = `flights:${flightNumber}:${date}`;
		if (!options?.bypassCache) {
			const cached = this.getCached<AviationstackFlight[]>(cacheKey);
			if (cached !== undefined) return cached;
		}

		const url = new URL(`${API_BASE_URL}/flights`);
		url.searchParams.append("access_key", this.apiKey);
		url.searchParams.append("flight_iata", flightNumber);

		const data = await this.fetchWithBudget(url, options);
		const matching = data.data.filter((f) => flightMatchesRequestedDate(f, date));
		this.setCache(cacheKey, matching);
		return matching;
	}

	async getFlightsByRoute(
		origin: string,
		destination: string,
		date: string,
		options?: FlightQueryOptions,
	): Promise<AviationstackFlight[]> {
		const cacheKey = `route:${origin}:${destination}:${date}`;
		if (!options?.bypassCache) {
			const cached = this.getCached<AviationstackFlight[]>(cacheKey);
			if (cached !== undefined) return cached;
		}

		const url = new URL(`${API_BASE_URL}/flights`);
		url.searchParams.append("access_key", this.apiKey);
		url.searchParams.append("dep_iata", origin);
		url.searchParams.append("arr_iata", destination);

		const data = await this.fetchWithBudget(url, options);
		const matching = data.data.filter((f) => flightMatchesRequestedDate(f, date));
		this.setCache(cacheKey, matching);
		return matching;
	}
}

export const aviationstackApi = new AviationstackAPI();
