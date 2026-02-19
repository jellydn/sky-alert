import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { flights } from "../db/schema.js";
import { logger } from "../utils/logger.js";

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const HOURS_TO_MARK_INACTIVE = 24;
const HOURS_TO_DELETE = 7 * 24; // 7 days

export function startCleanupWorker() {
	logger.info("✓ Starting cleanup worker");

	setInterval(async () => {
		await cleanupFlights();
	}, CLEANUP_INTERVAL);
}

async function cleanupFlights() {
	try {
		const now = new Date();
		const twentyFourHoursAgo = new Date(now.getTime() - HOURS_TO_MARK_INACTIVE * 60 * 60 * 1000);
		const sevenDaysAgo = new Date(now.getTime() - HOURS_TO_DELETE * 60 * 60 * 1000);

		const flightsToMarkInactive = await db
			.select()
			.from(flights)
			.where(
				and(
					eq(flights.isActive, true),
					lt(flights.scheduledDeparture, twentyFourHoursAgo.toISOString()),
				),
			);

		for (const flight of flightsToMarkInactive) {
			if (flight.currentStatus === "landed" || flight.currentStatus === "cancelled") {
				await db.update(flights).set({ isActive: false }).where(eq(flights.id, flight.id));
				logger.info(`✓ Marked flight ${flight.flightNumber} as inactive`);
			}
		}

		const flightsToDelete = await db
			.select()
			.from(flights)
			.where(lt(flights.scheduledDeparture, sevenDaysAgo.toISOString()));

		for (const flight of flightsToDelete) {
			await db.delete(flights).where(eq(flights.id, flight.id));
			logger.info(`✓ Deleted flight ${flight.flightNumber} from database`);
		}
	} catch (error) {
		logger.error("Error in cleanup worker:", error);
	}
}
