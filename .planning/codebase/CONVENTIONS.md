# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- kebab-case for all source files (e.g., `flight-service.ts`, `natural-language.ts`, `api-budget.ts`)

**Functions:**
- camelCase for functions (e.g., `parseFlightInput`, `saveAndConfirmFlight`, `getFlightsByNumber`)
- Async functions prefixed with action verbs (e.g., `startBot`, `trackFlight`, `pollFlights`)

**Variables:**
- camelCase (e.g., `flightNumber`, `chatId`, `apiFlights`)
- Descriptive boolean names (e.g., `alreadyTracking`, `isPollingEnabled`, `statusChanged`)

**Types:**
- PascalCase for interfaces and types (e.g., `AviationstackFlight`, `ParsedFlightInput`, `FlightInput`)
- `type` for type definitions, `interface` for object shapes

**Classes:**
- PascalCase (e.g., `AviationstackAPI`)

**Constants:**
- SCREAMING_SNAKE_CASE for module-level constants (e.g., `CACHE_TTL`, `FREE_TIER_LIMIT`, `POLL_INTERVAL_FAR`)

## Code Style

**Formatting:**
- Tab indentation
- No semicolons
- Double quotes for strings
- Trailing commas in multiline structures

**Linting:**
- Biome linter (configured via `bun run lint`)
- TypeScript strict mode enabled

**TypeScript Configuration:**
- Target: ES2022
- Module: ES2022
- Strict mode enabled
- Source maps and declaration files generated

## Import Organization

**Order:**
1. External packages (e.g., `grammy`, `drizzle-orm`)
2. Internal modules with relative paths (e.g., `../utils/logger.js`)

**Key Rules:**
- Always include `.js` extension in local imports (required for ES modules)
- Use `import type` for type-only imports
- Example:
```typescript
import type { Context } from "grammy";
import { and, eq } from "drizzle-orm";
import { bot } from "../bot/instance.js";
import type { AviationstackFlight } from "../services/aviationstack.js";
```

**Path Aliases:**
- None configured - all imports use relative paths

## Error Handling

**Patterns:**
- Guard clauses with early returns:
```typescript
if (!chatId) {
  await ctx.reply("Could not identify chat");
  return;
}
```

- `instanceof Error` for type checking:
```typescript
if (error instanceof Error) {
  if (error.message === "Monthly API budget exceeded") {
    // handle specific error
  }
}
```

- Descriptive error messages with context:
```typescript
throw new Error("AVIATIONSTACK_API_KEY environment variable is required");
throw new Error(`API request failed: ${response.status}`);
```

- User-friendly Telegram messages with emoji prefixes:
  - Success: `✅`
  - Error: `❌`
  - Warning: `⚠️`
  - Info: `ℹ️`

## Logging

**Framework:** Custom logger wrapper (`src/utils/logger.ts`) - NOT console directly

**Patterns:**
- Use the imported logger: `import { logger } from "../utils/logger.js";`
- Log levels controlled by `LOG_LEVEL` env var (default: "info")
- Levels: debug, info, warn, error
- Auto-formatted with timestamp and level prefix:
```typescript
logger.info("Bot connected to Telegram");
logger.debug(`API request: ${url}`);
logger.error("Failed:", error);
```

**When to Log:**
- Service startup/shutdown
- API requests (debug level)
- Errors with context
- User-facing operation results

## Comments

**When to Comment:**
- Handler registration order (critical comment in bot/index.ts)
- Polling intervals with time explanations
- Complex regex patterns

**JSDoc/TSDoc:**
- Not heavily used - code is self-documenting
- Type annotations serve as documentation

## Function Design

**Size:**
- Functions kept small and focused
- Handler functions handle one command
- Helper functions extracted for reuse

**Parameters:**
- Destructured when using multiple related values
- `ctx: Context` as first param in handlers
- Optional params use `?` or default values

**Return Values:**
- Explicit return types for exported functions:
```typescript
export async function getFlightById(id: number): Promise<Flight | undefined>
export function parseDate(message: string): string | null
```

- `null` for "not found" cases, not `undefined`
- Boolean returns for success/failure operations

## Module Design

**Exports:**
- Named exports preferred
- Instance pattern: export singleton instances
- Service pattern: export class and create instance at module level

**Barrel Files:**
- `bot/index.ts` exports bot instance and lifecycle functions
- `db/index.ts` exports database connection
- Handler imports in specific order (natural-language last)

**Handler Registration Pattern:**
- Handlers self-register by importing `bot` instance
- Order matters: natural-language handler must be last (catches all text)
```typescript
// src/bot/index.ts
import "../handlers/start.js";
import "../handlers/track.js";
// ... other handlers
import "../handlers/natural-language.js"; // MUST BE LAST
```

---

*Convention analysis: 2026-02-19*
