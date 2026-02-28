FROM oven/bun:1.1-slim

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy application code
COPY . .

# Build TypeScript
RUN bun run build

# Create data directory for SQLite with proper permissions
RUN mkdir -p /app/data && chown -R bun:bun /app/data

# Switch to non-root user for security
USER bun

# Run migrations and start the bot
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
