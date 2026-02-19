# AGENTS.md - SkyAlert Project Guidelines

Guidelines for agentic coding agents operating in this repository.

## Project Overview

SkyAlert is a real-time flight monitoring Telegram bot built with TypeScript. It tracks flights, polls for status changes, and sends proactive alerts to users.

**Tech Stack**: TypeScript, grammY (Telegram), SQLite (better-sqlite3), Drizzle ORM, Aviationstack API

---

## Build, Lint, and Test Commands

### Development

```bash
bun run dev          # Run development server (bun run src/index.ts)
bun run start        # Run production build (node dist/index.js)
```

### Build

```bash
bun run build        # Compile TypeScript to dist/
bun run typecheck    # Type-check without emitting files
```

### Linting

```bash
bun run lint         # Run Biome linter on all files
bunx biome check . --fix   # Auto-fix lint issues
bunx biome format . --write # Format all files
```

### Database

```bash
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:studio    # Open Drizzle Studio
```

### Testing

No test framework is configured yet. When adding tests, use Vitest:

```bash
bun test                      # Run all tests
bun test src/path/to/file.test.ts  # Run single test file
bun test --watch              # Watch mode
```

---

## Code Style Guidelines

### Imports

- Use ES module syntax with `import`/`export`
- Always include `.js` extension in local imports (required for ES modules)
- Group imports: external packages first, then internal modules
- Use double quotes for import paths

```typescript
// External packages
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";

// Internal modules (note .js extension)
import * as schema from "./schema.js";
```

### Formatting

- Tab indentation (Biome default)
- No semicolons at statement endings
- Double quotes for strings
- Trailing commas in multiline structures
- Max line width: 80 characters (configure in biome.json if needed)

### TypeScript

- Strict mode is enabled - no `any` without justification
- Prefer explicit return types for exported functions
- Use `type` for type definitions, `interface` for object shapes that may be extended
- Use `satisfies` operator for type-safe config objects
- Prefer `const` assertions for literal types

```typescript
export default {
  schema: "./src/db/schema.ts",
} satisfies Config;
```

### Naming Conventions

| Element          | Convention           | Example                               |
| ---------------- | -------------------- | ------------------------------------- |
| Variables        | camelCase            | `flightNumber`, `chatId`              |
| Functions        | camelCase            | `parseFlightInput()`, `sendAlert()`   |
| Types/Interfaces | PascalCase           | `FlightStatus`, `BotContext`          |
| Database tables  | camelCase            | `flights`, `trackedFlights`           |
| Constants        | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `API_BASE_URL`         |
| File names       | kebab-case           | `flight-service.ts`, `date-parser.ts` |

### Database Schema (Drizzle)

- Define tables in `src/db/schema.ts`
- Use SQLite-specific types from `drizzle-orm/sqlite-core`
- Include timestamps with `unixepoch()` default
- Use `$onUpdate` for automatic timestamp updates

```typescript
export const flights = sqliteTable("flights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  flightNumber: text("flight_number").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
```

### Error Handling

- Throw descriptive errors with context
- Use typed error classes for expected errors
- Log errors with relevant metadata
- Handle API rate limits gracefully with user-friendly messages

```typescript
if (!flight) {
  throw new Error(`Flight not found: ${flightNumber} on ${date}`);
}
```

### Telegram Bot Patterns

- Use grammY's context object (`ctx`) for all handlers
- Return `Promise<void>` from handlers
- Use middleware for shared logic (auth, logging)
- Keep handlers thin - delegate to service functions

```typescript
bot.command("track", async (ctx) => {
  const args = ctx.match;
  await handleTrackCommand(ctx, args);
});
```

### File Organization

```
src/
├── index.ts           # Entry point, bot initialization
├── db/
│   ├── index.ts       # Database connection
│   └── schema.ts      # Drizzle schema definitions
├── services/          # Business logic
│   ├── flight-service.ts
│   └── polling-service.ts
├── handlers/          # Telegram command handlers
│   └── commands.ts
├── utils/             # Shared utilities
│   └── date-parser.ts
└── types/             # TypeScript type definitions
    └── api-types.ts
```

---

## Environment Variables

Required variables (see `.env.example`):

- `BOT_TOKEN` - Telegram bot token from @BotFather
- `AVIATIONSTACK_API_KEY` - API key from aviationstack.com

Never commit `.env` files. Access via `process.env.VARIABLE_NAME`.

---

## Git Commit Guidelines

- Write clear, descriptive commit messages
- Use conventional commits format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Run `bun run typecheck` and `bun run lint` before committing

---

## API Integration Notes

- Aviationstack API has rate limits on free tier
- Implement request deduplication (same flight polled once regardless of trackers)
- Cache responses where appropriate to minimize API calls
- Handle API errors gracefully with user-friendly Telegram messages

---

## Important Reminders

1. Always run `bun run typecheck` after modifying TypeScript files
2. Always run `bun run lint` before committing
3. Generate migrations when modifying `src/db/schema.ts`
4. Use `bun` for package management and running scripts
5. Follow existing patterns in the codebase
