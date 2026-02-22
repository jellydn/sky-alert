const LOW_SIGNAL_STATUSES = new Set(["scheduled", "unknown", "n/a", "na", "unavailable"]);
const TERMINAL_STATUSES = new Set(["landed", "cancelled", "canceled", "arrived", "completed"]);
const GATE_INFO_WINDOW_MS = 6 * 60 * 60 * 1000;
const STATUS_ALIASES: Record<string, string> = {
	canceled: "cancelled",
	"in-air": "departed",
	in_air: "departed",
	enroute: "departed",
	"en-route": "departed",
};

export function normalizeFlightStatus(status?: string): string | undefined {
	if (!status) {
		return undefined;
	}

	const normalized = status.trim().toLowerCase();
	if (normalized.length === 0) {
		return undefined;
	}

	return STATUS_ALIASES[normalized] ?? normalized;
}

export function normalizeOperationalStatus(
	status?: string,
	scheduledDepartureIso?: string,
	flightDate?: string,
	nowMs = Date.now(),
	sourceFlightDate?: string,
): string | undefined {
	const normalized = normalizeFlightStatus(status);
	if (!normalized) {
		return undefined;
	}

	const progressLikeStatuses = new Set(["active", "departed", "landed", "arrived", "completed"]);
	const scheduledSourceDate = scheduledDepartureIso?.split("T")[0];
	if (
		scheduledSourceDate &&
		flightDate &&
		scheduledSourceDate < flightDate &&
		progressLikeStatuses.has(normalized)
	) {
		return "scheduled";
	}
	if (
		sourceFlightDate &&
		flightDate &&
		sourceFlightDate < flightDate &&
		progressLikeStatuses.has(normalized)
	) {
		return "scheduled";
	}

	if (flightDate) {
		const now = new Date(nowMs);
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
			now.getDate(),
		).padStart(2, "0")}`;
		if (flightDate > today && progressLikeStatuses.has(normalized)) {
			return "scheduled";
		}
	}

	if (scheduledDepartureIso) {
		const departureMs = Date.parse(scheduledDepartureIso);
		if (!Number.isNaN(departureMs) && departureMs > nowMs) {
			if (progressLikeStatuses.has(normalized)) {
				return "scheduled";
			}
		}
	}

	return normalized;
}

export function shouldUseDepartureStandInfo(
	scheduledDepartureIso?: string,
	flightDate?: string,
	status?: string,
	nowMs = Date.now(),
): boolean {
	const normalizedStatus = normalizeFlightStatus(status);
	if (normalizedStatus === "scheduled") {
		return false;
	}

	if (flightDate) {
		const now = new Date(nowMs);
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
			now.getDate(),
		).padStart(2, "0")}`;

		// If user is tracking a future calendar day, gate/terminal is usually stale.
		if (flightDate > today) {
			return false;
		}
	}

	if (!scheduledDepartureIso) {
		return true;
	}

	const departureMs = Date.parse(scheduledDepartureIso);
	if (Number.isNaN(departureMs)) {
		return true;
	}

	return departureMs - nowMs <= GATE_INFO_WINDOW_MS;
}

export function isLowSignalStatus(status?: string): boolean {
	const normalized = normalizeFlightStatus(status);
	if (!normalized) {
		return true;
	}

	return LOW_SIGNAL_STATUSES.has(normalized);
}

export function shouldUseStatusFallback(status?: string, delayMinutes?: number): boolean {
	return (!delayMinutes || delayMinutes <= 0) && isLowSignalStatus(status);
}

export function isTerminalFlightStatus(status?: string): boolean {
	const normalized = normalizeFlightStatus(status);
	if (!normalized) {
		return false;
	}

	return TERMINAL_STATUSES.has(normalized);
}

export function preferKnownStatus(
	currentStatus?: string,
	candidateStatus?: string,
): string | undefined {
	const normalizedCurrent = normalizeFlightStatus(currentStatus);
	const normalizedCandidate = normalizeFlightStatus(candidateStatus);

	if (!normalizedCandidate) {
		return normalizedCurrent;
	}

	if (
		normalizedCurrent &&
		!isLowSignalStatus(normalizedCurrent) &&
		isLowSignalStatus(normalizedCandidate)
	) {
		return normalizedCurrent;
	}

	if (
		normalizedCurrent &&
		isLowSignalStatus(normalizedCurrent) &&
		isLowSignalStatus(normalizedCandidate)
	) {
		return normalizedCurrent;
	}

	return normalizedCandidate;
}
