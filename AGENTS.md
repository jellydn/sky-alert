# AGENTS.md - SkyAlert Project Guidelines

SkyAlert is a real-time flight monitoring Telegram bot. **Tech Stack**: TypeScript, grammY (Telegram), SQLite (better-sqlite3), Drizzle ORM, Aviationstack API

---

## Commands

```bash
# Development
bun run dev          # Run dev server (bun run src/index.ts)
bun run start        # Run production build

# Build & Lint
bun run build        # Compile TypeScript to dist/
bun run typecheck    # Type-check without emitting
bun run lint         # Run Biome linter
bunx biome check . --fix   # Auto-fix lint issues

# Database
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations

# Testing (install Vitest first: bun add -d vitest)
bun test                           # Run all tests
bun test src/path/to/file.test.ts  # Run single test file
```

---

## Code Style

### Imports

- ES module syntax with `import`/`export`
- **Always include `.js` extension in local imports** (required for ES modules)
- Use `import type` for type-only imports
- Group: external packages first, then internal modules

```typescript
import type { Context } from "grammy";
import { and, eq } from "drizzle-orm";
import { bot } from "../bot/index.js";
import { flights } from "../db/schema.js";
```

### Formatting

- Tab indentation, no semicolons, double quotes, trailing commas in multiline

### TypeScript

- Strict mode - no `any` without justification
- Prefer explicit return types for exported functions
- Use `type` for type definitions, `interface` for extensible object shapes
- Use `satisfies` for type-safe config objects

### Naming Conventions

| Element          | Convention           | Example                              |
| ---------------- | -------------------- | ------------------------------------ |
| Variables/Funcs  | camelCase            | `flightNumber`, `parseFlightInput()` |
| Types/Interfaces | PascalCase           | `FlightStatus`, `BotContext`         |
| Classes          | PascalCase           | `AviationstackAPI`                   |
| Constants        | SCREAMING_SNAKE_CASE | `POLL_INTERVAL_LONG`                 |
| Files            | kebab-case           | `flight-service.ts`                  |

### Database Schema (Drizzle)

Define in `src/db/schema.ts`. Use SQLite types from `drizzle-orm/sqlite-core`. Include timestamps with `unixepoch()` default and `$onUpdate`.

```typescript
export const flights = sqliteTable("flights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

### Error Handling

- Throw descriptive errors with context
- Use `instanceof Error` for type checking
- Log errors with `console.error`
- Handle API errors with user-friendly messages

```typescript
if (error instanceof Error) {
  if (error.message === "Rate limit exceeded") {
    await ctx.reply("⚠️ Rate limit exceeded. Please try again later.");
    return;
  }
}
```

### Telegram Bot Patterns

- Import `bot` from `../bot/index.js` (handlers self-register)
- Return early on errors (guard clause)
- Use `{ parse_mode: "Markdown" }` for formatted messages
- Emoji prefixes: ✅ success, ❌ error, ⚠️ warning, ℹ️ info

```typescript
import type { Context } from "grammy";
import { bot } from "../bot/index.js";

bot.command("track", async (ctx: Context) => {
  const args = ctx.match?.toString().trim().split(/\s+/);
  if (!args || args.length < 2) {
    await ctx.reply("❌ *Invalid format*", { parse_mode: "Markdown" });
    return;
  }
});
```

### File Organization

```
src/
├── index.ts           # Entry point
├── bot/index.ts       # Bot instance, start/stop
├── db/
│   ├── index.ts       # Database connection
│   └── schema.ts      # Drizzle schema
├── services/          # Business logic
├── handlers/          # Command handlers (self-register)
└── utils/             # Shared utilities
```

---

## Environment Variables

- `BOT_TOKEN` - Telegram bot token from @BotFather
- `AVIATIONSTACK_API_KEY` - API key from aviationstack.com

---

## API Notes

- Aviationstack has rate limits on free tier
- Handle 429 as "Rate limit exceeded", 401 as "Invalid API key"
- API class instances created at module level

---

## Reminders

1. Run `bun run typecheck` after modifying TypeScript
2. Run `bun run lint` before committing
3. Generate migrations when modifying `src/db/schema.ts`
4. Handlers self-register by importing `bot` and calling `bot.command()`
5. Use `import type` for type-only imports
