import "dotenv/config";
import { startBot } from "./bot/index.js";
import { db } from "./db/index.js";

console.log("SkyAlert - Real-time flight monitoring Telegram bot");
console.log("Starting...");

// Verify database connection
try {
	db.query.flights.findFirst();
	console.log("✓ Database connected");
} catch (error) {
	console.error("✗ Database connection failed:", error);
	process.exit(1);
}

// Start the bot
startBot().catch((error) => {
	console.error("✗ Bot failed to start:", error);
	process.exit(1);
});
