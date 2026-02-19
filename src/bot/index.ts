import { GrammyError } from "grammy";
import { logger } from "../utils/logger.js";
import { bot } from "./instance.js";

export { bot } from "./instance.js";

// Command handlers — import before natural-language (catch-all)
import "../handlers/start.js";
import "../handlers/track.js";
import "../handlers/flights.js";
import "../handlers/status.js";
import "../handlers/remove.js";
import "../handlers/usage.js";

// Natural language must be last — it uses bot.on("message:text") which catches all text
import "../handlers/natural-language.js";

bot.catch((err) => {
	const ctx = err.ctx;
	logger.error(
		`Error while handling update ${ctx.update.update_id}:`,
		err.error,
	);
});

export async function startBot() {
	try {
		await bot.api.getMe();
		logger.info("✓ Bot connected to Telegram");
		await bot.start();
		logger.info("✓ Bot started successfully");
	} catch (error) {
		if (error instanceof GrammyError) {
			throw new Error(`Bot API error: ${error.description}`);
		}
		throw error;
	}
}

export function stopBot() {
	bot.stop();
}
