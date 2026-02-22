import type { AviationstackFlight } from "../services/aviationstack.js";

interface PendingRouteSelection {
	chatId: string;
	flights: AviationstackFlight[];
	requestedDate?: string;
	timestamp: number;
}

const pendingSelections = new Map<string, PendingRouteSelection>();

const SELECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function setPendingSelection(
	chatId: string,
	flights: AviationstackFlight[],
	requestedDate?: string,
) {
	pendingSelections.set(chatId, {
		chatId,
		flights,
		requestedDate,
		timestamp: Date.now(),
	});

	setTimeout(() => {
		pendingSelections.delete(chatId);
	}, SELECTION_TIMEOUT);
}

export function getPendingSelection(chatId: string): PendingRouteSelection | undefined {
	const selection = pendingSelections.get(chatId);
	if (!selection) {
		return undefined;
	}

	if (Date.now() - selection.timestamp > SELECTION_TIMEOUT) {
		pendingSelections.delete(chatId);
		return undefined;
	}

	return selection;
}

export function clearPendingSelection(chatId: string) {
	pendingSelections.delete(chatId);
}
