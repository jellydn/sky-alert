import { db } from "../db/index.js"
import { apiUsage } from "../db/schema.js"
import { eq } from "drizzle-orm"

const FREE_TIER_LIMIT = 100
const BUDGET_RESERVE = 5

function getCurrentMonth(): string {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

async function getOrCreateMonthRecord() {
	const month = getCurrentMonth()
	const existing = await db.query.apiUsage.findFirst({
		where: eq(apiUsage.month, month),
	})

	if (existing) return existing

	const result = await db
		.insert(apiUsage)
		.values({ month, requestCount: 0 })
		.returning()

	return result[0]
}

export async function getUsage(): Promise<{ used: number; limit: number; remaining: number }> {
	const record = await getOrCreateMonthRecord()
	const limit = FREE_TIER_LIMIT
	return {
		used: record.requestCount,
		limit,
		remaining: Math.max(0, limit - record.requestCount),
	}
}

export async function canMakeRequest(): Promise<boolean> {
	const { remaining } = await getUsage()
	return remaining > BUDGET_RESERVE
}

export async function recordRequest(): Promise<void> {
	const month = getCurrentMonth()
	await db
		.update(apiUsage)
		.set({
			requestCount: (await getOrCreateMonthRecord()).requestCount + 1,
			lastRequestAt: new Date(),
		})
		.where(eq(apiUsage.month, month))
}

export async function isPollingEnabled(): Promise<boolean> {
	const { remaining } = await getUsage()
	return remaining > FREE_TIER_LIMIT * 0.3
}

export function formatUsageMessage(used: number, limit: number): string {
	const remaining = Math.max(0, limit - used)
	const pct = Math.round((used / limit) * 100)
	return `📊 API Usage: ${used}/${limit} (${pct}%) — ${remaining} remaining this month`
}
