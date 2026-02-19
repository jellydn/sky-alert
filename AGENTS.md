# AGENTS.md - SkyAlert Project Guidelines

SkyAlert is a real-time flight monitoring Telegram bot. **Tech Stack**: TypeScript, grammY (Telegram), SQLite (better-sqlite3 via Bun), Drizzle ORM, Aviationstack API

---

## Commands

```bash
bun run dev           # Run dev server
bun run build         # Compile TypeScript to dist/
bun run typecheck     # Type-check without emitting
bun run lint          # Run Biome linter
bunx biome check . --fix    # Auto-fix lint issues
bun run db:generate   # Generate Drizzle migrations
bun run db:migrate    # Run migrations
bun run db:studio     # Open Drizzle Studio
bun test                           # Run all tests
bun test src/path/to/file.test.ts  # Run single test file
```

---

## Code Style

### Imports

- ES modules with `import`/`export`, **always include `.js` extension in local imports**
- Use `import type` for type-only imports. Group: external packages first, then internal modules

```typescript
import type { Context } from "grammy";
import { and, eq } from "drizzle-orm";
import { bot } from "../bot/instance.js";
```

### Formatting & TypeScript

- Tab indentation, no semicolons, double quotes, trailing commas in multiline
- Strict mode - no `any` without justification
- Use `type` for type definitions, `interface` for extensible shapes

### Naming Conventions

| Element          | Convention           | Example             |
| ---------------- | -------------------- | ------------------- |
| Variables/Funcs  | camelCase            | `flightNumber`      |
| Types/Interfaces | PascalCase           | `FlightStatus`      |
| Classes          | PascalCase           | `AviationstackAPI`  |
| Constants        | SCREAMING_SNAKE_CASE | `CACHE_TTL`         |
| Files            | kebab-case           | `flight-service.ts` |

### Logger Usage

Use custom logger (not `console`). Set level via `LOG_LEVEL` env var (debug/info/warn/error).

```typescript
import { logger } from "../utils/logger.js";
logger.info("✓ Bot connected");
logger.error("✗ Failed:", error);
```

### Error Handling

Throw descriptive errors, use `instanceof Error` for type checking, handle API errors with user-friendly messages.

---

## Bot Patterns

### Handler Registration Order

Handlers self-register by importing `bot`. **Natural-language handler must be imported last**:

```typescript
import "../handlers/start.js";
import "../handlers/track.js";
import "../handlers/natural-language.js"; // MUST BE LAST
```

### Instance Pattern

Bot instance in `instance.ts`, lifecycle in `index.ts`:

```typescript
// src/bot/instance.ts
export const bot = new Bot(botToken);
// src/bot/index.ts
export { bot } from "./instance.js";
export async function startBot() {
  await bot.start();
}
```

### Message Formatting

Return early on errors, use `{ parse_mode: "Markdown" }`, emoji prefixes: ✅ ❌ ⚠️ ℹ️

---

## Service Patterns

### Class-based Services

API services use classes with caching. Create instances at module level: `const api = new AviationstackAPI();`

### API Budget Management

```typescript
import { canMakeRequest, recordRequest } from "../services/api-budget.js";
if (!(await canMakeRequest())) throw new Error("Monthly API budget exceeded");
await recordRequest();
```

---

## Database

### Schema (Drizzle)

Define in `src/db/schema.ts` with SQLite types and timestamps:

```typescript
export const flights = sqliteTable("flights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  flightNumber: text("flight_number").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
});
```

### Query Patterns

```typescript
const flight = await db.query.flights.findFirst({ where: eq(flights.id, id) });
const existing = await db.query.trackedFlights.findFirst({
  where: and(
    eq(trackedFlights.chatId, chatId),
    eq(trackedFlights.flightId, flightId),
  ),
});
const result = await db
  .insert(flights)
  .values(input)
  .returning({ id: flights.id });
await db
  .update(flights)
  .set({ isActive: false })
  .where(eq(flights.id, flightId));
await db.delete(trackedFlights).where(eq(trackedFlights.chatId, chatId));
```

---

## File Organization

```
src/
├── index.ts              # Entry point, starts workers + bot
├── bot/instance.ts       # Bot instance creation
├── bot/index.ts          # Handler imports, start/stop functions
├── db/index.ts           # Database connection
├── db/schema.ts          # Drizzle schema definitions
├── services/             # Business logic (flight-service, polling, cleanup)
├── handlers/             # Command handlers (self-register via bot.command)
└── utils/                # Shared utilities (logger, formatters)
```

---

## Environment Variables

| Variable                | Description                              |
| ----------------------- | ---------------------------------------- |
| `BOT_TOKEN`             | Telegram bot token from @BotFather       |
| `AVIATIONSTACK_API_KEY` | API key from aviationstack.com           |
| `LOG_LEVEL`             | debug, info, warn, error (default: info) |

---

## API Notes

- Aviationstack free tier: 100 requests/month
- Handle HTTP 429 as "Rate limit exceeded", 401 as "Invalid API key"
- Use `api-budget.ts` to track usage (reserves 5 requests buffer)
- Polling service auto-disables when budget < 30% remaining

---

## Reminders

1. Run `bun run typecheck` after modifying TypeScript
2. Run `bun run lint` before committing
3. Generate migrations when modifying `src/db/schema.ts`
4. Import handlers in correct order (natural-language last)
5. Use `import type` for type-only imports
6. Use logger, not console directly
