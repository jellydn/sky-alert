# Welcome to SkyAlert 👋

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg?cacheSeconds=2592000)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/jellydn/sky-alert/blob/main/LICENSE)
[![Twitter: jellydn](https://img.shields.io/twitter/follow/jellydn.svg?style=social)](https://twitter.com/jellydn)

> Real-time flight monitoring Telegram bot. Track flights, get instant alerts on delays, gate changes, boarding, and more.

![SkyAlert Logo](logo.svg)

## Features

- **Track flights** by flight number, natural language, or route (e.g., `DAD to SIN today`)
- **Real-time alerts** — check-in open, delays, gate changes, boarding, departure, landing, cancellation
- **Adaptive polling** — every 15 min (far), 5 min (near), 1 min (imminent)
- **Multi-user** — multiple users can track the same flight with deduplicated API calls
- **Auto-cleanup** — expired flights are deactivated and removed automatically
- **Live refresh fallback** — uses FlightAware parsing when Aviationstack returns low-signal status data

## Tech Stack

- **TypeScript** + [grammY](https://grammy.dev/) (Telegram Bot framework)
- **SQLite** (via better-sqlite3 or Drizzle)
- **[Aviationstack API](https://aviationstack.com/)** for flight data

## Install

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Set BOT_TOKEN and AVIATIONSTACK_API_KEY in .env
```

## Usage

```bash
# Run the bot
bun run start
```

## Develop

```bash
# Run in development mode
bun run dev

# Type-check
bun run typecheck

# Lint
bun run lint
```

### Justfile shortcuts

```bash
just dev
just db-generate
just db-migrate
just db-studio
```

<img width="1179" height="1402" alt="image" src="https://github.com/user-attachments/assets/7482a219-3737-46da-a5c0-9d8cca170a39" />
<img width="1179" height="2429" alt="image" src="https://github.com/user-attachments/assets/fb4d642e-14cf-42bf-92b4-09674128bd91" />

## Environment Variables

| Variable                | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `BOT_TOKEN`             | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `AVIATIONSTACK_API_KEY` | API key from [aviationstack.com](https://aviationstack.com/) |

## Bot Commands

| Command                   | Description                           |
| ------------------------- | ------------------------------------- |
| `/start`                  | Welcome message                       |
| `/track AA123 2026-03-15` | Track a flight                        |
| `/flights`                | List all tracked flights              |
| `/status AA123`           | View current flight status + timeline |
| `/remove AA123`           | Stop tracking a flight                |
| `/help`                   | Show available commands               |

The bot also understands natural language:

- `Track my flight GA851 tomorrow`
- `DAD to SIN today`

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
          │
          ▼ (fallback when needed)
     FlightAware page parser
```

## Status Refresh, Timeout, and Fallback Rules

### Refresh timing

- `/status` refreshes flight data when either condition is true:
- Data is stale (`>= 15 minutes` since last poll)
- Data is low-signal (`scheduled`/empty status and no delay)
- Polling worker interval by time-to-departure:
- `> 3h`: every `15 minutes`
- `<= 3h`: every `5 minutes`
- `<= 1h`: every `1 minute`

### Caching

- Aviationstack response cache TTL: `15 minutes`
- Live refresh paths (`/status`, polling worker) bypass cache to force fresh provider data

### Selection timeout

- Multi-result flight selection (route or ambiguous number) expires after `5 minutes`
- If expired, user must search/select again

### Fallback behavior

- Primary source is Aviationstack
- Fallback to FlightAware is used only when Aviationstack is low-signal:
- Status is `scheduled` or empty, and delay is missing/non-positive
- Fallback tries multiple identifiers (`ICAO`, `IATA`, user input), e.g. `TGW315` then `TR315`
- If fallback provides delay, `/status` shows:
- `Status: delayed` (if no stronger status from primary)
- `Delay: X min`
- `Estimated` departure and arrival times (scheduled + delay)

### Known limitations

- If both providers return no delay signal, bot will remain on scheduled/on-time data
- FlightAware fallback is HTML/bootstrap parsing, not an official FlightAware API

## Author

👤 **Huynh Duc Dung**

- Website: https://productsway.com/
- Twitter: [@jellydn](https://twitter.com/jellydn)
- Github: [@jellydn](https://github.com/jellydn)

## Show your support

Give a ⭐️ if this project helped you!

[![ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/dunghd)
[![paypal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/dunghd)
[![buymeacoffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/dunghd)

## License

MIT © [Huynh Duc Dung](https://productsway.com/)
