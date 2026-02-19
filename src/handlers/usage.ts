import { bot } from "../bot/instance.js";
import { formatUsageMessage, getUsage, isPollingEnabled } from "../services/api-budget.js";
import { logger } from "../utils/logger.js";

bot.command("usage", async (ctx) => {
	try {
		const { used, limit, remaining } = await getUsage();
		const pollingActive = await isPollingEnabled();

		let message = `${formatUsageMessage(used, limit)}\n\n`;
		message += `🔄 Background polling: ${pollingActive ? "✅ Active" : "⏸️ Paused (budget low)"}\n`;

		if (remaining <= 10) {
			message += "\n⚠️ *Low budget!* Only on-demand `/status` checks will use API calls.";
		}

		await ctx.reply(message, { parse_mode: "Markdown" });
	} catch (error) {
		logger.error("Error showing usage:", error);
		await ctx.reply("❌ Failed to retrieve API usage.");
	}
});
