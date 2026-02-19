# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- TypeScript 5.7.3 - Entire codebase (ES modules, strict mode)

**Secondary:**
- SQL - Drizzle migrations (SQLite dialect)

## Runtime

**Environment:**
- Bun 1.3.8 - Primary runtime for development
- Node.js - Production runtime (ES2022 target)

**Package Manager:**
- Bun - Fast package manager and bundler
- Lockfile: bun.lock (present)

## Frameworks

**Core:**
- grammY 1.34.2 - Telegram Bot framework (long polling, middleware-based)

**Testing:**
- None configured - No test framework present

**Build/Dev:**
- TypeScript compiler (tsc) - Build to dist/
- Drizzle Kit 0.30.2 - Database migrations and introspection
- Biome - Linting and formatting (invoked via bunx)

## Key Dependencies

**Critical:**
- grammy ^1.34.2 - Telegram Bot API client with middleware support
- drizzle-orm ^0.41.0 - Type-safe ORM for SQLite
- dotenv ^16.4.7 - Environment variable management

**Infrastructure:**
- bun:sqlite - Built-in SQLite driver for Bun runtime
- drizzle-orm/bun-sqlite - Drizzle adapter for Bun SQLite

## Configuration

**Environment:**
- .env file with BOT_TOKEN and AVIATIONSTACK_API_KEY
- LOG_LEVEL (optional: debug, info, warn, error - default: info)
- Environment loaded via dotenv/config at entry point

**Build:**
- tsconfig.json - ES2022 target, ES2022 modules, strict mode
- drizzle.config.ts - SQLite dialect, schema at src/db/schema.ts
- justfile - Task runner for common commands

## Platform Requirements

**Development:**
- Bun runtime 1.x
- SQLite 3.x (via Bun built-in)

**Production:**
- Node.js 18+ (ES2022 support required)
- SQLite database file at ./data/sky-alert.db

---

*Stack analysis: 2026-02-19*
