import { Bot } from "grammy";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	throw new Error("BOT_TOKEN environment variable is required");
}

export const bot = new Bot(botToken);
