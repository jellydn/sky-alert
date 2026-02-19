import { Bot } from "grammy";
import { logger } from "../utils/logger.js";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	throw new Error("BOT_TOKEN environment variable is required");
}

export const bot = new Bot(botToken);

bot.use(async (ctx, next) => {
	logger.debug(
		`Received update ${ctx.update.update_id}: ${ctx.message?.text ?? "(no text)"}`,
	);
	await next();
});
