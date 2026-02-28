# Single stage build for native module compatibility
FROM node:lts-slim

WORKDIR /app

# Install Bun and build tools
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Bun system-wide
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun

# Copy package files
COPY package.json bun.lock ./

# Install all dependencies
RUN bun install --frozen-lockfile

# Copy application code
COPY . .

# Create data directory for SQLite with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Switch to non-root user for security
USER node

# Run migrations and start the bot
CMD ["sh", "-c", "bun run db:migrate && bun run src/index.ts"]
