# SkyAlert - Flight Monitoring Telegram Bot

# Development
dev:
    bun run src/index.ts

# Production
start:
    node dist/index.js

# Build
build:
    tsc

typecheck:
    tsc --noEmit

# Lint & Format
lint:
    biome check .

lint-fix:
    bunx biome check . --fix

format:
    bunx biome format . --write

# Database
db-generate:
    drizzle-kit generate

db-migrate:
    drizzle-kit migrate

db-studio:
    drizzle-kit studio

# Install
install:
    bun install
