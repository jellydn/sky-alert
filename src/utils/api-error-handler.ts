import type { Context } from "grammy";

const EXPECTED_API_ERRORS = new Set([
	"Monthly API budget exceeded",
	"Rate limit exceeded",
	"Invalid API key",
]);

export function isExpectedApiError(error: unknown): boolean {
	return error instanceof Error && EXPECTED_API_ERRORS.has(error.message);
}

export async function handleApiError(ctx: Context, error: unknown): Promise<void> {
	if (!(error instanceof Error)) {
		await ctx.reply("❌ An unexpected error occurred. Please try again later.");
		return;
	}

	const errorMessages: Record<string, string> = {
		"Monthly API budget exceeded":
			"⚠️ *Monthly API budget exceeded*\n\n" +
			"Free tier limit (100 requests/month) reached.\n" +
			"Use `/usage` to check your remaining budget.",
		"Rate limit exceeded": "⚠️ *Rate limit exceeded*\n\nPlease try again later.",
		"Invalid API key":
			"❌ *Configuration error*\n\n" +
			"Invalid Aviationstack API key. Please contact the administrator.",
	};

	const message = errorMessages[error.message];
	if (message) {
		await ctx.reply(message, { parse_mode: "Markdown" });
		return;
	}

	await ctx.reply("❌ Failed to complete request. Please try again later.");
}
