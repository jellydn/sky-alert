# Codebase Concerns

**Analysis Date:** 2026-02-19
**Last Updated:** 2026-02-19

## Status Summary

### Resolved
- Shared Aviationstack client instance now used across handlers/services (`aviationstackApi` singleton).
- Graceful shutdown implemented (`SIGINT`/`SIGTERM` stop bot/workers and close DB).
- `tracked_flights` now has DB-level unique constraint and atomic insert path.
- Silent catch in `/status` replaced with warning log + user-facing stale-data note.
- Cleanup worker N+1 pattern replaced with batch update/delete operations.
- Core flight lookup indexes added (`flight_number + flight_date`, `scheduled_departure`).
- Aviationstack cache now has a bounded size cap.
- Startup DB failure fixed by ensuring `./data` directory exists before SQLite open.
- `just` DB commands now use local drizzle-kit binary; migrate works reliably.
- Fallback precedence stabilized: FlightStats is now preferred for low-signal live refresh, with FlightAware only as secondary fallback.
- Aviationstack in-memory cache eviction now behaves as LRU by access (read refresh + oldest-key eviction).

### Partial
- API usage race risk reduced with `onConflictDoNothing` in month record creation, but usage accounting is still eventually consistent under high concurrency.

### Open
- Pending selection state is still in-memory and lost on restart.
- No per-user command rate limiting.
- Handler-order fragility remains (natural-language handler must stay last).
- Broad test quality gap remains (many tests are string/pattern checks, not handler/service integration behavior).
- Health check endpoint is still missing.
- External error reporting is not configured.
- Database backup strategy is not defined.

## Tech Debt

**In-Memory Pending Selections (Open)**
- Files: `src/utils/pending-selections.ts`
- Impact: Selection state lost on restart; poor UX for multi-step flow
- Next fix: Persist pending selections in SQLite with TTL cleanup

**Natural Language Import Order Dependency (Open)**
- Files: `src/bot/index.ts`, `src/handlers/natural-language.ts`
- Impact: Reordering imports can break command handlers silently
- Next fix: Replace catch-all ordering dependency with explicit routing guard/middleware

## Known Bugs / Risks

**Migration History Drift (Resolved)**
- Files: `drizzle/0000_bumpy_sunfire.sql`
- Resolution: Removed duplicate legacy baseline migration files and kept a single canonical `0000_*` baseline
- Follow-up: Keep migration numbering strictly sequential from this baseline

**Pending Selection Volatility (Open)**
- Files: `src/utils/pending-selections.ts`
- Trigger: Process restart or crash during selection window
- Workaround: User must rerun lookup

## Security Considerations

**No Rate Limiting on Bot Commands (Open)**
- Files: `src/handlers/`
- Risk: Spam can deplete API budget
- Current mitigation: Global monthly API budget guard
- Next fix: Add per-chat token bucket/sliding window (e.g. 10 commands/minute)

**API Key Logging Exposure (Open)**
- Files: `src/services/aviationstack.ts`
- Risk: URL logging in debug mode could still expose sensitive structure despite masking
- Current mitigation: Key masking in debug output
- Next fix: Avoid logging full query URLs in production paths

## Performance Bottlenecks

**Single-Threaded Polling (Open)**
- Files: `src/services/polling-service.ts`
- Risk: Poll backlog at higher tracked-flight volume
- Next fix: Add bounded concurrency queue

**In-Memory Cache Policy Simplicity (Resolved)**
- Files: `src/services/aviationstack.ts`
- Resolution: Cache now refreshes insertion order on reads and evicts oldest entry, providing LRU-by-access behavior.

**Fallback Source Consistency (Resolved)**
- Files: `src/handlers/status.ts`, `src/services/polling-service.ts`
- Resolution: Unified low-signal fallback precedence (FlightStats first, FlightAware second) and aligned display/update fields for delay/status/gate/terminal.

## Scaling Limits

**Aviationstack Free Tier (Open)**
- Limit: 100 requests/month
- Impact: Very limited active tracking capacity with polling enabled
- Path: Paid tier or provider abstraction/fallback

**SQLite Single-Instance Constraints (Open)**
- Limit: File-based DB is not ideal for multi-instance horizontal scaling
- Path: Move to PostgreSQL for shared deployment scenarios

## Dependencies / Tooling Risks

**Drizzle CLI Runtime Resolution (Open)**
- Context: `bunx drizzle-kit ...` had runtime dependency resolution issues in this environment
- Current mitigation: project uses `./node_modules/.bin/drizzle-kit` in `justfile` and `package.json`
- Next fix: Document this convention in README/AGENTS to avoid regressions

## Missing Critical Features

**No Health Check Endpoint (Open)**
- Blocks: Monitoring/ops readiness

**No External Error Reporting (Open)**
- Blocks: Production issue visibility

**No Automated Backup Plan (Open)**
- Blocks: Recovery guarantees for SQLite data

## Test Coverage Gaps

**High-Risk Areas Still Under-Tested (Open)**
- `src/services/api-budget.ts` concurrency and budget edge cases
- `src/services/polling-service.ts` scheduling/interval behavior
- `src/services/cleanup-service.ts` batch cleanup correctness
- `src/handlers/status.ts` refresh-failure path and stale-data messaging

## Issue Tracking

- Pending selection persistence: #10 https://github.com/jellydn/sky-alert/issues/10
- Per-chat command rate limiting: #11 https://github.com/jellydn/sky-alert/issues/11
- Natural-language handler order fragility: #12 https://github.com/jellydn/sky-alert/issues/12
- API budget concurrency race: #13 https://github.com/jellydn/sky-alert/issues/13
- Health/readiness endpoint: #14 https://github.com/jellydn/sky-alert/issues/14
- External error reporting: #15 https://github.com/jellydn/sky-alert/issues/15
- Backup/restore strategy: #16 https://github.com/jellydn/sky-alert/issues/16
- Behavior-focused integration tests: #17 https://github.com/jellydn/sky-alert/issues/17
- Polling bounded concurrency: #18 https://github.com/jellydn/sky-alert/issues/18
- Aviationstack log sanitization hardening: #19 https://github.com/jellydn/sky-alert/issues/19

---

*Concerns audit updated: 2026-02-19*
