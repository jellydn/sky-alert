import "dotenv/config";
import { startBot, stopBot } from "./bot/index.js";
import { closeDatabase, db } from "./db/index.js";
import { startCleanupWorker, stopCleanupWorker } from "./services/cleanup-service.js";
import { startPollingWorker, stopPollingWorker } from "./services/polling-service.js";
import { logger } from "./utils/logger.js";

logger.info("SkyAlert - Real-time flight monitoring Telegram bot");
logger.info("Starting...");

let isShuttingDown = false;

async function shutdown(signal: string) {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	logger.info(`Received ${signal}, shutting down...`);

	try {
		stopPollingWorker();
		stopCleanupWorker();
		await stopBot();
		closeDatabase();
		logger.info("✓ Graceful shutdown completed");
		process.exit(0);
	} catch (error) {
		logger.error("✗ Graceful shutdown failed:", error);
		process.exit(1);
	}
}

process.on("SIGINT", () => {
	void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
	void shutdown("SIGTERM");
});

async function main() {
	try {
		await db.query.flights.findFirst();
		logger.info("✓ Database connected");
	} catch (error) {
		logger.error("✗ Database connection failed:", error);
		process.exit(1);
	}

	startCleanupWorker();
	startPollingWorker();

	try {
		await startBot();
	} catch (error) {
		logger.error("✗ Bot failed to start:", error);
		process.exit(1);
	}
}

void main();
