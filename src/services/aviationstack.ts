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

export class AviationstackAPI {
	private apiKey: string;

	constructor() {
		this.apiKey = process.env.AVIATIONSTACK_API_KEY || "";
		if (!this.apiKey) {
			throw new Error("AVIATIONSTACK_API_KEY environment variable is required");
		}
	}

	async getFlightByNumber(
		flightNumber: string,
		date: string,
	): Promise<AviationstackFlight | null> {
		const url = new URL(`${API_BASE_URL}/flights`);
		url.searchParams.append("access_key", this.apiKey);
		url.searchParams.append("flight_iata", flightNumber);
		url.searchParams.append("flight_date", date);

		try {
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

			const data = (await response.json()) as AviationstackResponse;

			if (data.data.length === 0) {
				return null;
			}

			return data.data[0];
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("Failed to fetch flight data");
		}
	}
}
