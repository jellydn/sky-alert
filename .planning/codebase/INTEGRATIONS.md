# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**Flight Data:**
- Aviationstack API - Real-time flight tracking data
- SDK/Client: Custom class (AviationstackAPI) with in-memory caching
- Auth: AVIATIONSTACK_API_KEY env var
- Base URL: https://api.aviationstack.com/v1
- Endpoints: /flights (by flight number, by route)
- Rate limit: 100 requests/month (free tier)
- Cache TTL: 15 minutes

**Messaging:**
- Telegram Bot API - User interaction and notifications
- SDK/Client: grammY framework (long polling)
- Auth: BOT_TOKEN env var from @BotFather
- Features: Commands, inline keyboards, markdown messages

## Data Storage

**Databases:**
- SQLite - Embedded database for persistence
- Connection: File-based at ./data/sky-alert.db
- Client: Drizzle ORM with bun:sqlite driver
- Mode: WAL (Write-Ahead Logging) for concurrent access
- Tables: flights, tracked_flights, api_usage, status_changes

**File Storage:**
- Local filesystem only - SQLite database and logs

**Caching:**
- In-memory Map - AviationstackAPI response caching
- TTL: 15 minutes for flight data
- No external caching service

## Authentication & Identity

**Auth Provider:**
- Telegram - OAuth via Bot API
- Implementation: Bot token authentication, chat ID for user identification
- No custom user accounts - identifies users by Telegram chat_id

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service

**Logs:**
- Custom logger (src/utils/logger.ts) - Console-based with log levels
- Levels: debug, info, warn, error
- Configurable via LOG_LEVEL env var
- Timestamped JSON-like format

## CI/CD & Deployment

**Hosting:**
- Not configured - Designed for standalone deployment

**CI Pipeline:**
- Renovate - Automated dependency updates
- No CI/CD pipeline configured (no GitHub Actions, GitLab CI, etc.)

**Task Runner:**
- justfile - Development task automation (dev, build, lint, db commands)

## Environment Configuration

**Required env vars:**
- BOT_TOKEN - Telegram bot token from @BotFather
- AVIATIONSTACK_API_KEY - API key from aviationstack.com

**Optional env vars:**
- LOG_LEVEL - Logging verbosity (debug/info/warn/error)

**Secrets location:**
- .env file (gitignored)
- No secret management service integration

## Webhooks & Callbacks

**Incoming:**
- None - Bot uses long polling (not webhooks)

**Outgoing:**
- Telegram Bot API - sendMessage for notifications
- Aviationstack API - GET requests for flight data

---

*Integration audit: 2026-02-19*
