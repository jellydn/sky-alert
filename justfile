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
    ./node_modules/.bin/drizzle-kit generate

db-migrate:
    ./node_modules/.bin/drizzle-kit migrate

db-studio port="4984":
    ./node_modules/.bin/drizzle-kit studio --port {{port}}

# Install
install:
    bun install
