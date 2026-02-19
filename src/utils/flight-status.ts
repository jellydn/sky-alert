const LOW_SIGNAL_STATUSES = new Set(["scheduled", "unknown", "n/a", "na", "unavailable"]);
const TERMINAL_STATUSES = new Set(["landed", "cancelled", "canceled", "arrived", "completed"]);

export function normalizeFlightStatus(status?: string): string | undefined {
	if (!status) {
		return undefined;
	}

	const normalized = status.trim().toLowerCase();
	return normalized.length > 0 ? normalized : undefined;
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
