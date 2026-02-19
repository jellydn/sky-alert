import { and, eq, lt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { flights } from "../db/schema.js";
import { logger } from "../utils/logger.js";

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const HOURS_TO_MARK_INACTIVE = 24;
const HOURS_TO_DELETE = 7 * 24; // 7 days
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startCleanupWorker() {
	if (cleanupTimer) {
		return;
	}

	logger.info("✓ Starting cleanup worker");

	cleanupTimer = setInterval(async () => {
		await cleanupFlights();
	}, CLEANUP_INTERVAL);
}

export function stopCleanupWorker() {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
		logger.info("✓ Cleanup worker stopped");
	}
}

async function cleanupFlights() {
	try {
		const now = new Date();
		const twentyFourHoursAgo = new Date(now.getTime() - HOURS_TO_MARK_INACTIVE * 60 * 60 * 1000);
		const sevenDaysAgo = new Date(now.getTime() - HOURS_TO_DELETE * 60 * 60 * 1000);

		const deactivatedFlights = await db
			.update(flights)
			.set({ isActive: false })
			.where(
				and(
					eq(flights.isActive, true),
					lt(flights.scheduledDeparture, twentyFourHoursAgo.toISOString()),
					or(eq(flights.currentStatus, "landed"), eq(flights.currentStatus, "cancelled")),
				),
			)
			.returning({ id: flights.id });

		const deletedFlights = await db
			.delete(flights)
			.where(lt(flights.scheduledDeparture, sevenDaysAgo.toISOString()))
			.returning({ id: flights.id });

		if (deactivatedFlights.length > 0) {
			logger.info(`✓ Marked ${deactivatedFlights.length} flights as inactive`);
		}
		if (deletedFlights.length > 0) {
			logger.info(`✓ Deleted ${deletedFlights.length} old flights from database`);
		}
	} catch (error) {
		logger.error("Error in cleanup worker:", error);
	}
}
