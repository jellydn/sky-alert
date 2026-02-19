# ✈️ SkyAlert

Real-time flight monitoring Telegram bot. Track flights, get instant alerts on delays, gate changes, boarding, and more.

## Features

- **Track flights** by flight number, natural language, or route (e.g., `SFO to LAX today`)
- **Real-time alerts** — check-in open, delays, gate changes, boarding, departure, landing, cancellation
- **Adaptive polling** — every 5 min normally, every 1 min near departure
- **Multi-user** — multiple users can track the same flight with deduplicated API calls
- **Auto-cleanup** — expired flights are deactivated and removed automatically

## Tech Stack

- **TypeScript** + [grammY](https://grammy.dev/) (Telegram Bot framework)
- **SQLite** (via better-sqlite3 or Drizzle)
- **[Aviationstack API](https://aviationstack.com/)** for flight data

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Set BOT_TOKEN and AVIATIONSTACK_API_KEY in .env

# Run
bun run start
```

## Environment Variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `AVIATIONSTACK_API_KEY` | API key from [aviationstack.com](https://aviationstack.com/) |

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/track AA123 2026-03-15` | Track a flight |
| `/flights` | List all tracked flights |
| `/status AA123` | View current flight status + timeline |
| `/remove AA123` | Stop tracking a flight |
| `/help` | Show available commands |

The bot also understands natural language:
- `Track my flight AA123 tomorrow`
- `SFO to LAX today`

## Architecture

```
┌─────────────────────────────────┐
│         Telegram Bot            │
│  (grammY – long polling)        │
├─────────────────────────────────┤
│     Message Parser / Router     │
│  (commands + natural language)  │
├──────────┬──────────────────────┤
│ Flight   │  Background Worker   │
│ Service  │  (adaptive polling)  │
├──────────┴──────────────────────┤
│         SQLite Database         │
│  flights | tracked_flights |    │
│       status_changes            │
└─────────────────────────────────┘
          │
          ▼
   Aviationstack API
```

## License

MIT
