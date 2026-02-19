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

interface CacheEntry<T> {
	data: T;
	timestamp: number;
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
		return entry.data as T;
	}

	private setCache<T>(key: string, data: T): void {
		this.cache.set(key, { data, timestamp: Date.now() });
	}

	private async fetchWithBudget(url: URL): Promise<AviationstackResponse> {
		const { canMakeRequest, recordRequest } = await import("./api-budget.js");

		if (!(await canMakeRequest())) {
			throw new Error("Monthly API budget exceeded");
		}

		const response = await fetch(url.toString());

		if (!response.ok) {
			if (response.status === 429) {
				throw new Error("Rate limit exceeded");
			}
			if (response.status === 401) {
				throw new Error("Invalid API key");
			}
			throw new Error(`API request failed: ${response.status}`);
		}

		await recordRequest();

		return (await response.json()) as AviationstackResponse;
	}

	async getFlightByNumber(
		flightNumber: string,
		date: string,
	): Promise<AviationstackFlight | null> {
		const cacheKey = `flight:${flightNumber}:${date}`;
		const cached = this.getCached<AviationstackFlight | null>(cacheKey);
		if (cached !== undefined) return cached;

		const url = new URL(`${API_BASE_URL}/flights`);
		url.searchParams.append("access_key", this.apiKey);
		url.searchParams.append("flight_iata", flightNumber);
		url.searchParams.append("flight_date", date);

		try {
			const data = await this.fetchWithBudget(url);
			const result = data.data.length === 0 ? null : data.data[0];
			this.setCache(cacheKey, result);
			return result;
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("Failed to fetch flight data");
		}
	}

	async getFlightsByRoute(
		origin: string,
		destination: string,
		date: string,
	): Promise<AviationstackFlight[]> {
		const cacheKey = `route:${origin}:${destination}:${date}`;
		const cached = this.getCached<AviationstackFlight[]>(cacheKey);
		if (cached !== undefined) return cached;

		const url = new URL(`${API_BASE_URL}/flights`);
		url.searchParams.append("access_key", this.apiKey);
		url.searchParams.append("dep_iata", origin);
		url.searchParams.append("arr_iata", destination);
		url.searchParams.append("flight_date", date);

		try {
			const data = await this.fetchWithBudget(url);
			this.setCache(cacheKey, data.data);
			return data.data;
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("Failed to fetch flight data");
		}
	}
}
