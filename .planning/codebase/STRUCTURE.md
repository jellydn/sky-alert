# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
sky-alert/
├── src/                    # Source code
│   ├── bot/                # Bot instance and lifecycle
│   ├── db/                 # Database schema and connection
│   ├── handlers/           # Command/message handlers
│   ├── services/           # Business logic services
│   ├── utils/              # Shared utilities
│   └── index.ts            # Application entry point
├── data/                   # SQLite database files
├── dist/                   # Compiled TypeScript output
├── drizzle/                # Database migrations
├── scripts/                # Development scripts
├── .planning/              # Planning documents
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── drizzle.config.ts       # Drizzle ORM configuration
├── justfile                # Task runner commands
├── AGENTS.md               # AI agent guidelines
└── README.md               # Project documentation
```

## Directory Purposes

**src/bot/:**
- Purpose: Telegram bot configuration and lifecycle
- Contains: Bot instance creation, handler imports, start/stop functions
- Key files: `instance.ts` (bot creation), `index.ts` (handler registration, lifecycle)

**src/db/:**
- Purpose: Database layer
- Contains: Drizzle ORM setup, table schemas
- Key files: `schema.ts` (table definitions), `index.ts` (connection)

**src/handlers/:**
- Purpose: User-facing command handlers
- Contains: One file per command/route, natural language handler
- Key files: `track.ts`, `flights.ts`, `status.ts`, `remove.ts`, `usage.ts`, `start.ts`, `natural-language.ts`

**src/services/:**
- Purpose: Core business logic and integrations
- Contains: API clients, flight management, background workers
- Key files: `aviationstack.ts`, `flight-service.ts`, `polling-service.ts`, `cleanup-service.ts`, `api-budget.ts`

**src/utils/:**
- Purpose: Shared helper functions
- Contains: Logging, parsing, formatting, state management
- Key files: `logger.ts`, `flight-parser.ts`, `format-time.ts`, `pending-selections.ts`

**data/:**
- Purpose: Persistent storage
- Contains: SQLite database file
- Key files: `sky-alert.db`

**drizzle/:**
- Purpose: Database migrations
- Contains: Generated migration files and metadata
- Key files: `meta/_journal.json`, `0000_snapshot.json`, etc.

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main application entry, starts all workers and bot

**Configuration:**
- `package.json`: Dependencies, scripts, metadata
- `tsconfig.json`: TypeScript compiler options
- `drizzle.config.ts`: Drizzle ORM configuration
- `.env.example`: Environment variable template

**Core Logic:**
- `src/bot/instance.ts`: Bot instance creation with middleware
- `src/services/aviationstack.ts`: External API client with caching
- `src/services/flight-service.ts`: Flight CRUD operations
- `src/services/polling-service.ts`: Background flight status monitoring
- `src/services/api-budget.ts`: API usage tracking and limits
- `src/db/schema.ts`: Database table definitions

**Handlers:**
- `src/handlers/track.ts`: /track command and flight saving
- `src/handlers/natural-language.ts`: Catch-all text handler (MUST be imported last)

**Testing:**
- N/A (no tests currently)

## Naming Conventions

**Files:**
- kebab-case: `flight-service.ts`, `api-budget.ts`, `natural-language.ts`
- Descriptive names matching functionality

**Directories:**
- kebab-case: `bot/`, `db/`, `handlers/`, `services/`, `utils/`
- Single-word directory names preferred

**Code:**
- Variables/functions: camelCase (`flightNumber`, `parseFlightInput`)
- Types/interfaces: PascalCase (`FlightInput`, `AviationstackFlight`)
- Classes: PascalCase (`AviationstackAPI`)
- Constants: SCREAMING_SNAKE_CASE (`CACHE_TTL`, `FREE_TIER_LIMIT`)

## Where to Add New Code

**New Command:**
- Primary code: `src/handlers/<command-name>.ts`
- Import in: `src/bot/index.ts` (before natural-language.ts)
- Example: Create `src/handlers/stats.ts`, import in bot/index.ts

**New Feature (Business Logic):**
- Primary code: `src/services/<feature>-service.ts`
- If database needed: Add table to `src/db/schema.ts`, run `bun run db:generate`

**New API Integration:**
- Primary code: `src/services/<api-name>.ts`
- Pattern: Class-based with caching, budget-aware if external

**New Utility:**
- Shared helpers: `src/utils/<utility-name>.ts`
- Export and import where needed

**New Database Table:**
- Schema: `src/db/schema.ts`
- Generate migration: `bun run db:generate`
- Run migration: `bun run db:migrate`

## Special Directories

**data/:**
- Purpose: SQLite database storage
- Generated: Yes (by application)
- Committed: No (gitignored)

**dist/:**
- Purpose: Compiled TypeScript output
- Generated: Yes (by `bun run build`)
- Committed: No (gitignored)

**drizzle/:**
- Purpose: Database migration files
- Generated: Yes (by `bun run db:generate`)
- Committed: Yes (version controlled)

**.planning/:**
- Purpose: Planning documents, architecture notes
- Generated: Manual
- Committed: Yes (version controlled)

## Import Order

**Handler Import Order (IMPORTANT):**
```typescript
// src/bot/index.ts - Order matters!
import "../handlers/start.js";
import "../handlers/track.js";
import "../handlers/flights.js";
import "../handlers/status.js";
import "../handlers/remove.js";
import "../handlers/usage.js";
import "../handlers/natural-language.js"; // MUST BE LAST
```

Natural language handler uses `bot.on("message:text")` which catches ALL text messages. It must be imported last to allow command handlers to match first.

---

*Structure analysis: 2026-02-19*
