import { Bot, GrammyError } from "grammy";
import "../handlers/track.js";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	throw new Error("BOT_TOKEN environment variable is required");
}

export const bot = new Bot(botToken);

bot.command("start", async (ctx) => {
	await ctx.reply(
		"✈️ *Welcome to SkyAlert!*\n\n" +
			"Your personal flight monitoring assistant. Track flights in real-time and get instant alerts on delays, gate changes, boarding, and more.\n\n" +
			"*Quick Start:*\n" +
			"• Use /help to see all available commands\n" +
			"• Use /track followed by flight number and date (e.g., `/track AA123 2026-03-15`)\n\n" +
			"*Supported formats:*\n" +
			"• Flight number: `/track UA456 2026-03-20`\n" +
			"• Route: `SFO to LAX today`\n" +
			"• Natural language: `Track my flight DL789 tomorrow`\n\n" +
			"Get notified before you fly! 🚀",
		{ parse_mode: "Markdown" },
	);
});

bot.command("help", async (ctx) => {
	await ctx.reply(
		"*📋 Available Commands*\n\n" +
			"/start - Welcome message\n" +
			"/help - Show this help message\n" +
			"/track <flight> <date> - Track a flight\n" +
			"/flights - List all tracked flights\n" +
			"/status <flight> - View flight status\n" +
			"/remove <flight> - Stop tracking a flight\n\n" +
			"*Examples:*\n" +
			"• `/track AA123 2026-03-15`\n" +
			"• `/status UA456`\n" +
			"• `/remove DL789`\n\n" +
			"You can also use natural language:\n" +
			'• "Track my flight AA123 tomorrow"\n' +
			'• "SFO to LAX today"',
		{ parse_mode: "Markdown" },
	);
});

bot.on("message", async (ctx) => {
	await ctx.reply("Hi! Use /help to see available commands.");
});

export async function startBot() {
	try {
		await bot.api.getMe();
		console.log("✓ Bot connected to Telegram");
		await bot.start();
		console.log("✓ Bot started successfully");
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
