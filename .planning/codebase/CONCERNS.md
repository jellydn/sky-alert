# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

**Multiple AviationstackAPI Instance Creation:**
- Issue: AviationstackAPI class instantiated 4 times in separate files (track.ts, natural-language.ts, polling-service.ts, status.ts) instead of using singleton pattern
- Files: `src/handlers/track.ts:16`, `src/handlers/natural-language.ts:13`, `src/services/polling-service.ts:9`, `src/handlers/status.ts:11`
- Impact: Each instance has its own cache Map, reducing cache effectiveness. Memory waste, potential cache inconsistencies
- Fix approach: Export a single instance from aviationstack.ts or use dependency injection

**No Graceful Shutdown:**
- Issue: Application exits abruptly without cleaning up resources (database connections, pending operations, bot stop)
- Files: `src/index.ts`
- Impact: Potential data loss on shutdown, database corruption risk, in-flight operations dropped
- Fix approach: Implement SIGINT/SIGTERM handlers to call stopBot(), close database, flush pending writes

**In-Memory Pending Selections:**
- Issue: User flight selection state stored in Map with no persistence
- Files: `src/utils/pending-selections.ts`
- Impact: Lost on restart, users lose their selection state, poor UX
- Fix approach: Store in SQLite with TTL expiration or use Redis

## Known Bugs

**Race Condition in recordRequest():**
- Symptoms: Under concurrent requests, request count may be inaccurate
- Files: `src/services/api-budget.ts:48-56`
- Trigger: Multiple API requests in rapid succession
- Workaround: None - unlikely to hit with current usage patterns

**Missing Unique Constraint on tracked_flights:**
- Symptoms: Potential duplicate tracking entries if race condition occurs
- Files: `src/db/schema.ts:27-36`
- Trigger: User rapidly clicking track button or concurrent requests
- Workaround: Code checks for existing before insert, but no DB-level protection

**Silent Catch Block:**
- Symptoms: Errors during status refresh silently ignored, falling back to stale data
- Files: `src/handlers/status.ts:100-102`
- Trigger: API errors, network issues during manual status check
- Workaround: Still shows cached data, but user not informed of refresh failure

## Security Considerations

**No Rate Limiting on Bot Commands:**
- Risk: Malicious user could spam commands, depleting API budget
- Files: All handlers in `src/handlers/`
- Current mitigation: API budget system prevents total exhaustion
- Recommendations: Implement per-user rate limiting (e.g., max 10 commands/minute)

**API Key Exposure in Logs:**
- Risk: API key visible in debug logs (partially masked)
- Files: `src/services/aviationstack.ts:110`
- Current mitigation: Key replaced with "***" in log output
- Recommendations: Ensure LOG_LEVEL is not 'debug' in production

**No Input Validation:**
- Risk: Malformed flight numbers or routes could cause unexpected behavior
- Files: `src/utils/flight-parser.ts`, all handlers
- Current mitigation: Regex patterns filter input
- Recommendations: Add explicit validation with user-friendly error messages

**No Authorization Checks:**
- Risk: Any user can track any flight, no user isolation concerns
- Files: `src/handlers/remove.ts`, `src/handlers/status.ts`
- Current mitigation: ChatId-based isolation (users can only see their own tracked flights)
- Recommendations: Consider if flight data should be private per-user

## Performance Bottlenecks

**N+1 Query Pattern in Cleanup Service:**
- Problem: Iterating over flights one-by-one for updates/deletes instead of batch operations
- Files: `src/services/cleanup-service.ts:38-58`
- Cause: Sequential database operations in for loop
- Improvement path: Use batch UPDATE/DELETE with WHERE IN clause

**No Database Indexes:**
- Problem: Queries on flight_number + flight_date combination not indexed
- Files: `src/db/schema.ts`
- Cause: Default Drizzle schema without explicit indexes
- Improvement path: Add composite index on (flight_number, flight_date), index on scheduled_departure

**Unbounded In-Memory Cache:**
- Problem: AviationstackAPI cache Map has no size limit, could grow unbounded
- Files: `src/services/aviationstack.ts:79`
- Cause: No eviction policy implemented
- Improvement path: Implement LRU cache with max size or use third-party cache library

## Fragile Areas

**Natural Language Handler Order Dependency:**
- Files: `src/bot/index.ts:16`, `src/handlers/natural-language.ts`
- Why fragile: Uses `bot.on("message:text")` which catches ALL text messages. Must be imported last or commands break
- Safe modification: Never reorder imports, add new command handlers before natural-language import
- Test coverage: None - behavior changes could break silently

**Pending Selections Memory State:**
- Files: `src/utils/pending-selections.ts`
- Why fragile: State lost on restart, timeout uses setTimeout (cleared on process exit)
- Safe modification: Add persistence layer before changing timeout logic
- Test coverage: None

**Multiple Flight Service Entry Points:**
- Files: `src/handlers/track.ts:118`, `src/handlers/natural-language.ts:117`
- Why fragile: saveAndConfirmFlight exported and called from multiple places, could diverge in behavior
- Safe modification: Keep both callers synchronized with same error handling
- Test coverage: None

## Scaling Limits

**API Budget Constraint:**
- Current capacity: 100 requests/month (Aviationstack free tier)
- Limit: With polling enabled, can only track ~10-20 flights per month actively
- Scaling path: Upgrade to paid Aviationstack tier ($50+/month) or add multiple API keys with rotation

**Single-Threaded Polling:**
- Current capacity: Sequential flight polling with intervals
- Limit: With hundreds of flights, polling queue could lag behind schedule
- Scaling path: Implement parallel polling with concurrency limit, or use job queue

**SQLite Database:**
- Current capacity: Single file database, works for single instance
- Limit: Cannot scale horizontally, file locking contention under high write load
- Scaling path: Migrate to PostgreSQL for multi-instance deployment

## Dependencies at Risk

**Aviationstack API:**
- Risk: Free tier extremely limited (100 requests/month), API could change or be discontinued
- Impact: Core functionality broken, no flight data
- Migration plan: Consider alternative APIs (FlightAware, OpenSky) or implement fallback sources

**Bun Runtime:**
- Risk: Bun-specific database module (`bun:sqlite`) ties application to Bun
- Impact: Cannot run on Node.js, limits deployment options
- Migration plan: Switch to better-sqlite3 (works on both) or libsql

**Grammy Framework:**
- Risk: Relatively newer framework, smaller community than telegraf
- Impact: Fewer resources for troubleshooting, potential breaking changes
- Migration plan: Stable API so far, monitor for deprecations

## Missing Critical Features

**No Test Suite:**
- Problem: Zero test coverage on any functionality
- Blocks: Confident refactoring, CI/CD validation, regression prevention

**No Health Check Endpoint:**
- Problem: No way to verify bot is running and healthy
- Blocks: Proper monitoring, Kubernetes deployment, uptime tracking

**No Error Reporting:**
- Problem: Errors only logged locally, no external error tracking
- Blocks: Visibility into production issues, error trend analysis

**No Database Backup:**
- Problem: SQLite database not backed up
- Blocks: Recovery from data loss scenarios

## Test Coverage Gaps

**All Core Functionality Untested:**
- What's not tested: All handlers, services, utilities
- Files: All `.ts` files in `src/`
- Risk: Refactoring or feature additions could break existing behavior
- Priority: High - Start with flight-service.ts and api-budget.ts (core logic)

**Specific Untested Areas:**
- Date parsing logic in flight-parser.ts (complex regex and date math)
- Cache expiration in aviationstack.ts
- Polling intervals and budget checking
- Cleanup service deletion logic
- Error handling paths in all handlers

---

*Concerns audit: 2026-02-19*
