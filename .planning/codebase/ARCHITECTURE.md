# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Layered Architecture with Self-Registering Handlers

**Key Characteristics:**
- Modular layer separation (entry, bot, handlers, services, data, utils)
- Self-registering command handlers via side-effect imports
- Background workers for async processing (polling, cleanup)
- Budget-aware API consumption with caching
- SQLite with Drizzle ORM for persistence

## Layers

**Entry Layer:**
- Purpose: Application bootstrap, starts all workers and bot
- Location: `src/index.ts`
- Contains: Startup logic, database verification, worker initialization
- Depends on: bot, db, services (polling, cleanup), utils (logger)
- Used by: N/A (root)

**Bot Layer:**
- Purpose: Telegram bot instance and lifecycle management
- Location: `src/bot/`
- Contains: Bot instance creation, handler imports (self-registration), start/stop functions
- Depends on: grammy, handlers (via import), utils (logger)
- Used by: Entry layer, handlers, services (polling sends messages)

**Handler Layer:**
- Purpose: Process user commands and messages
- Location: `src/handlers/`
- Contains: Command handlers (start, track, flights, status, remove, usage), natural language catch-all
- Depends on: bot (instance), services, db, utils
- Used by: Bot layer (via import for self-registration)

**Service Layer:**
- Purpose: Business logic and external integrations
- Location: `src/services/`
- Contains: AviationstackAPI (external), flight-service (CRUD), polling-service (background), cleanup-service (background), api-budget (usage tracking)
- Depends on: db, bot (for notifications), utils
- Used by: Handlers, other services

**Data Layer:**
- Purpose: Database connection and schema definition
- Location: `src/db/`
- Contains: Drizzle ORM setup, schema definitions (flights, trackedFlights, apiUsage, statusChanges)
- Depends on: bun:sqlite, drizzle-orm
- Used by: Services, handlers

**Utility Layer:**
- Purpose: Shared helper functions and types
- Location: `src/utils/`
- Contains: Logger, flight parser, time formatters, pending selections state
- Depends on: N/A
- Used by: All layers

## Data Flow

**Track Flight Flow:**
1. User sends message (command or natural language)
2. Handler parses input, calls AviationstackAPI
3. API checks budget, fetches flight data, records usage
4. Flight-service creates/updates flight in database
5. Tracking relationship created (chatId → flightId)
6. Confirmation message sent to user

**Polling Flow:**
1. Polling worker wakes every minute (budget-permitting)
2. Fetches active flights departing within 6 hours
3. For each flight due for polling (interval based on proximity)
4. Calls AviationstackAPI for current status
5. Compares old vs new status/gate/terminal/delay
6. If changes detected: records status change, notifies all trackers
7. Updates flight record with latest data

**Cleanup Flow:**
1. Cleanup worker wakes every hour
2. Marks flights as inactive (landed/cancelled > 24h ago)
3. Deletes flights older than 7 days

**State Management:**
- SQLite database for persistent state (flights, tracking, usage)
- In-memory Map for transient state (pending selections with 5-min timeout)
- In-memory cache in AviationstackAPI (15-min TTL)

## Key Abstractions

**AviationstackAPI Class:**
- Purpose: Encapsulates external flight data API with caching and budget awareness
- Examples: `src/services/aviationstack.ts`
- Pattern: Class with private cache Map, budget integration, error handling

**Flight Service Functions:**
- Purpose: CRUD operations for flights and tracking relationships
- Examples: `src/services/flight-service.ts`
- Pattern: Pure async functions with explicit types, Drizzle queries

**Self-Registering Handlers:**
- Purpose: Decouple handler registration from bot setup
- Examples: `src/handlers/*.ts`
- Pattern: Import bot instance, call `bot.command()` or `bot.on()` at module load time

**Budget Manager:**
- Purpose: Track and limit API usage to stay within free tier
- Examples: `src/services/api-budget.ts`
- Pattern: Functions that check/record usage, auto-pause polling when low

## Entry Points

**Main Entry (src/index.ts):**
- Location: `src/index.ts`
- Triggers: Process start (`bun run dev` or `bun run start`)
- Responsibilities: Verify DB, start cleanup worker, start polling worker, start bot

**Bot Lifecycle (src/bot/index.ts):**
- Location: `src/bot/index.ts`
- Triggers: Imported by main entry
- Responsibilities: Import handlers (order matters!), error handling, startBot/stopBot functions

**Handler Registration:**
- Location: `src/handlers/*.ts`
- Triggers: Module import at startup
- Responsibilities: Register command/message handlers with bot instance

## Error Handling

**Strategy:** Layered error handling with user-friendly messages

**Patterns:**
- Guard clauses: Return early with error message on invalid input
- Try-catch with instanceof Error: Handle known error types specifically
- API error translation: Convert technical errors to user messages (rate limit, budget exceeded, invalid key)
- Silent fallbacks: Polling failures logged but don't crash worker
- Bot catch handler: Global error handler for unhandled errors

## Cross-Cutting Concerns

**Logging:** Custom logger with level-based filtering (debug, info, warn, error), configured via LOG_LEVEL env var

**Validation:** Input validation in handlers (flight number format, date parsing), natural language parsing with fallback guidance

**Authentication:** Telegram bot token validation at startup, API key validation in AviationstackAPI constructor

**Caching:** In-memory Map with TTL in AviationstackAPI (15 min), reduces API calls

**Budget Management:** Centralized in api-budget.ts, all API calls go through canMakeRequest/recordRequest

---

*Architecture analysis: 2026-02-19*
