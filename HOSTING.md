# Hosting Guide for SkyAlert

This guide covers deploying SkyAlert bot to popular hosting platforms with persistent SQLite storage.

## Prerequisites

Before deploying, you'll need:

1. **Telegram Bot Token** — Get one from [@BotFather](https://t.me/BotFather)
2. **Aviationstack API Key** — Sign up at [aviationstack.com](https://aviationstack.com/)
3. Your deployment platform account (Fly.io, Render, or Railway)

## Required Environment Variables

All platforms need these environment variables configured:

| Variable                | Description                                                  | Example                           |
| ----------------------- | ------------------------------------------------------------ | --------------------------------- |
| `BOT_TOKEN`             | Telegram bot token from [@BotFather](https://t.me/BotFather) | `1234567890:ABCdefGHIjklMNOpqr...` |
| `AVIATIONSTACK_API_KEY` | API key from [aviationstack.com](https://aviationstack.com/) | `abc123def456...`                 |
| `LOG_LEVEL`             | Optional: debug, info, warn, error (default: info)          | `info`                            |

## Database Persistence

SkyAlert uses SQLite with the database file stored at `./data/sky-alert.db`. Each platform requires a **persistent volume** to prevent data loss between deployments.

### Important Database Notes

- The app automatically creates the `./data` directory and database file on first run
- Database uses WAL (Write-Ahead Logging) mode for better concurrency
- Migrations run automatically on startup (if needed)
- **Without persistent storage, all flight tracking data will be lost on each deployment/restart**

---

## Deployment Options

### Option 1: Fly.io (Recommended)

Fly.io offers excellent support for persistent volumes and runs Bun natively.

#### 1. Install Fly CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

#### 2. Login to Fly.io

```bash
fly auth login
```

#### 3. Create `fly.toml` in your project root

```toml
app = "sky-alert"
primary_region = "sin"  # Change to your preferred region (sin, iad, lhr, etc.)

[build]
  dockerfile = "Dockerfile"

[env]
  LOG_LEVEL = "info"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1

[mounts]
  source = "sky_alert_data"
  destination = "/app/data"
  initial_size = "1gb"
```

#### 4. Create a `Dockerfile`

```dockerfile
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

# Ensure data directory exists
RUN mkdir -p /app/data

# Run migrations and start the bot
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
```

#### 5. Create the app and volume

```bash
# Create the app
fly apps create sky-alert

# Create a persistent volume (1GB)
fly volumes create sky_alert_data --region sin --size 1

# Set environment variables
fly secrets set BOT_TOKEN="your_telegram_bot_token"
fly secrets set AVIATIONSTACK_API_KEY="your_aviationstack_api_key"
```

#### 6. Deploy

```bash
fly deploy
```

#### 7. Monitor logs

```bash
fly logs
```

#### Tips for Fly.io

- Use `fly ssh console` to access the container and inspect the database
- Scale with `fly scale vm shared-cpu-1x --memory 512` if needed
- Volume backups: `fly volumes list` and create snapshots via the dashboard
- Keep the machine always running by setting `auto_stop_machines = false`

---

### Option 2: Render

Render provides simple deployment with persistent disks.

#### 1. Create `render.yaml` (optional, for infrastructure as code)

```yaml
services:
  - type: web
    name: sky-alert
    runtime: docker
    plan: starter
    dockerfilePath: ./Dockerfile
    envVars:
      - key: BOT_TOKEN
        sync: false
      - key: AVIATIONSTACK_API_KEY
        sync: false
      - key: LOG_LEVEL
        value: info
    disk:
      name: sky-alert-data
      mountPath: /app/data
      sizeGB: 1
```

#### 2. Create a `Dockerfile` (if not already created for Fly.io)

```dockerfile
FROM oven/bun:1.1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .
RUN bun run build

RUN mkdir -p /app/data

CMD ["sh", "-c", "bun run db:migrate && bun run start"]
```

#### 3. Deploy via Render Dashboard

1. Go to [render.com](https://render.com) and sign in
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `sky-alert`
   - **Runtime**: Docker
   - **Plan**: Starter ($7/month) or higher
   - **Build Command**: (leave empty, Docker handles it)
   - **Start Command**: (leave empty, Dockerfile CMD handles it)
5. Add environment variables:
   - `BOT_TOKEN`
   - `AVIATIONSTACK_API_KEY`
   - `LOG_LEVEL` (optional)
6. Add a **Persistent Disk**:
   - **Name**: `sky-alert-data`
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB
7. Click **Create Web Service**

#### Tips for Render

- Render automatically redeploys on git push (if connected to GitHub)
- Access logs via the dashboard or CLI
- Database persists across deploys thanks to the mounted disk
- Consider using Render's cron jobs if you need scheduled tasks

---

### Option 3: Railway

Railway offers straightforward deployment with volume support.

#### 1. Install Railway CLI (optional)

```bash
npm install -g @railway/cli
railway login
```

#### 2. Create `railway.json` (optional)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "bun run db:migrate && bun run start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### 3. Create a `Dockerfile` (same as above)

#### 4. Deploy via Railway Dashboard

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Railway will auto-detect settings, or you can configure:
   - **Root Directory**: `/` (or your project root)
   - **Build Command**: (handled by Dockerfile)
   - **Start Command**: `bun run db:migrate && bun run start`
5. Add environment variables in the **Variables** tab:
   - `BOT_TOKEN`
   - `AVIATIONSTACK_API_KEY`
   - `LOG_LEVEL` (optional)
6. Add a **Volume**:
   - Click **Settings** → **Volumes**
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB
7. Deploy!

#### Deploy via CLI (alternative)

```bash
# Initialize project
railway init

# Link to your project
railway link

# Add environment variables
railway variables set BOT_TOKEN="your_telegram_bot_token"
railway variables set AVIATIONSTACK_API_KEY="your_aviationstack_api_key"

# Create volume (via dashboard or API)
# Mount path: /app/data

# Deploy
railway up
```

#### Tips for Railway

- Railway auto-deploys on git push
- Monitor with `railway logs`
- Volumes are automatically backed up
- Use Railway's built-in metrics for monitoring

---

## Running Database Migrations

All deployment commands include migrations (`bun run db:migrate`), but you can also run them manually:

### Fly.io

```bash
fly ssh console
cd /app
bun run db:migrate
```

### Render

Use the **Shell** tab in the Render dashboard, then:

```bash
cd /app
bun run db:migrate
```

### Railway

```bash
railway run bun run db:migrate
```

---

## Troubleshooting

### Bot not responding

1. **Check logs** on your platform's dashboard
2. **Verify environment variables** are set correctly
3. **Test locally** with `bun run dev` to ensure the bot token works
4. **Check Telegram Bot API** — ensure your bot isn't blocked

### Database errors

1. **Ensure persistent volume is mounted** at `/app/data`
2. **Check file permissions** — the app needs write access
3. **Run migrations** manually if they didn't run on deploy
4. **Inspect the database** file:
   ```bash
   # Inside container
   ls -la /app/data/
   ```

### "Monthly API budget exceeded"

- The free tier of Aviationstack allows 100 requests/month
- SkyAlert reserves 5 requests as a buffer
- Consider upgrading your Aviationstack plan if you track many flights

### Memory issues

- Default configuration uses **256MB RAM** (Fly.io) or similar on other platforms
- If you see OOM errors, increase memory:
  - **Fly.io**: `fly scale vm shared-cpu-1x --memory 512`
  - **Render/Railway**: Upgrade your plan in the dashboard

### Volume full

- Check volume usage in your platform's dashboard
- Default 1GB should be sufficient for most use cases
- SQLite database with WAL mode uses `sky-alert.db`, `sky-alert.db-shm`, `sky-alert.db-wal`
- Clean up old data if needed, or increase volume size

---

## Next Steps

After deployment:

1. **Test the bot** — Send `/start` to your bot on Telegram
2. **Track a flight** — Try `/track AA123 2026-03-15`
3. **Monitor logs** — Watch for any errors or warnings
4. **Set up monitoring** — Consider uptime monitoring (UptimeRobot, Healthchecks.io)
5. **Backup strategy** — Export volume snapshots periodically

---

## Cost Estimates (as of 2026)

| Platform | Minimum Plan  | Storage | Total/month |
| -------- | ------------- | ------- | ----------- |
| Fly.io   | Free tier + volume | $0.15/GB | ~$0.15 (or $1.94 if using shared-cpu-1x) |
| Render   | Starter | Included | $7 |
| Railway  | Hobby | $0.25/GB | ~$5 + storage |

**Note**: Fly.io free tier might require occasional manual scaling. For production, consider a paid plan for better reliability.

---

## Additional Resources

- [Fly.io Docs](https://fly.io/docs/)
- [Render Docs](https://render.com/docs)
- [Railway Docs](https://docs.railway.app/)
- [grammY Hosting Guide](https://grammy.dev/guide/deployment-types.html)
- [Bun Docker Images](https://hub.docker.com/r/oven/bun)

---

**Need help?** Open an issue on [GitHub](https://github.com/jellydn/sky-alert/issues) or contact the maintainer.
