# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**
- Vitest (optional, not yet installed)
- Config: Not configured (would use `vitest.config.ts`)

**Assertion Library:**
- Vitest built-in assertions (when installed)

**Run Commands:**
```bash
bun test                           # Run all tests
bun test src/path/to/file.test.ts  # Run single test file
```

**Installation:**
```bash
bun add -d vitest
```

## Test File Organization

**Location:**
- Co-located with source files (recommended pattern)
- Test files named alongside source: `flight-service.test.ts`

**Naming:**
- `.test.ts` suffix (e.g., `flight-parser.test.ts`)
- `.spec.ts` suffix also acceptable

**Structure:**
```
src/
├── services/
│   ├── flight-service.ts
│   ├── flight-service.test.ts    # Co-located tests
│   ├── api-budget.ts
│   └── api-budget.test.ts
├── utils/
│   ├── flight-parser.ts
│   └── flight-parser.test.ts
└── handlers/
    └── track.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("parseFlightInput", () => {
  test("should parse flight number with date", () => {
    const result = parseFlightInput("AA123 2026-03-15");
    expect(result.flightNumber).toBe("AA123");
    expect(result.date).toBe("2026-03-15");
  });

  test("should parse route with today", () => {
    const result = parseFlightInput("SFO to LAX today");
    expect(result.isRoute).toBe(true);
    expect(result.origin).toBe("SFO");
    expect(result.destination).toBe("LAX");
  });
});
```

**Patterns:**
- Arrange-Act-Assert pattern
- Descriptive test names using "should" format
- Group related tests in `describe` blocks

## Mocking

**Framework:** Vitest built-in mocking (`vi`)

**Patterns:**
```typescript
import { vi, expect } from "vitest";

// Mock external API
vi.mock("../services/aviationstack.js", () => ({
  AviationstackAPI: vi.fn(() => ({
    getFlightsByNumber: vi.fn().mockResolvedValue([mockFlight]),
  })),
}));

// Mock database
vi.mock("../db/index.js", () => ({
  db: {
    query: {
      flights: {
        findFirst: vi.fn().mockResolvedValue(mockFlight),
      },
    },
  },
}));
```

**What to Mock:**
- External API calls (Aviationstack API)
- Database operations (Drizzle queries)
- Telegram bot API calls
- Time-dependent functions (dates)

**What NOT to Mock:**
- Pure utility functions (e.g., `formatTime`, `parseDate`)
- Type definitions
- Simple data transformations

## Fixtures and Factories

**Test Data:**
```typescript
// fixtures/flights.ts
import type { AviationstackFlight } from "../../src/services/aviationstack.js";

export const mockAviationstackFlight: AviationstackFlight = {
  flight_date: "2026-03-15",
  flight_status: "scheduled",
  departure: {
    airport: "San Francisco International",
    timezone: "America/Los_Angeles",
    iata: "SFO",
    icao: "KSFO",
    terminal: "1",
    gate: "A12",
    delay: 0,
    scheduled: "2026-03-15T10:00:00+00:00",
    estimated: "2026-03-15T10:00:00+00:00",
    actual: "",
    estimated_runway: "",
    actual_runway: "",
  },
  arrival: {
    airport: "Los Angeles International",
    timezone: "America/Los_Angeles",
    iata: "LAX",
    icao: "KLAX",
    terminal: "4",
    gate: "B22",
    baggage: "5",
    delay: 0,
    scheduled: "2026-03-15T12:30:00+00:00",
    estimated: "2026-03-15T12:30:00+00:00",
    actual: "",
    estimated_runway: "",
    actual_runway: "",
  },
  airline: {
    name: "American Airlines",
    iata: "AA",
    icao: "AAL",
  },
  flight: {
    number: "123",
    iata: "AA123",
    icao: "AAL123",
  },
  aircraft: {
    registration: "N12345",
    iata: "B738",
    icao: "B738",
    icao24: "A1B2C3",
  },
};
```

**Location:**
- `src/__tests__/fixtures/` for shared fixtures
- Co-located fixtures for single-file use

## Coverage

**Requirements:** None enforced (tests not yet implemented)

**View Coverage:**
```bash
bun test --coverage
```

## Test Types

**Unit Tests:**
- Pure utility functions (`parseDate`, `formatTime`, `parseFlightInput`)
- Service class methods with mocked dependencies
- Business logic in isolation

**Integration Tests:**
- Handler functions with mocked API/database
- Database operations with test database
- API budget tracking with test database

**E2E Tests:**
- Not currently used
- Could use Telegram bot testing framework for full flows

## Common Patterns

**Async Testing:**
```typescript
test("should fetch flights from API", async () => {
  const flights = await api.getFlightsByNumber("AA123", "2026-03-15");
  expect(flights).toHaveLength(1);
  expect(flights[0].flight.iata).toBe("AA123");
});
```

**Error Testing:**
```typescript
test("should throw error when API budget exceeded", async () => {
  // Setup: exhaust budget
  vi.mocked(canMakeRequest).mockResolvedValue(false);
  
  await expect(api.getFlightsByNumber("AA123", "2026-03-15"))
    .rejects.toThrow("Monthly API budget exceeded");
});

test("should handle invalid flight number", async () => {
  const result = parseFlightInput("invalid input without flight");
  expect(result.flightNumber).toBeNull();
});
```

**Before/After Hooks:**
```typescript
describe("FlightService", () => {
  beforeEach(async () => {
    // Reset database state
    await db.delete(trackedFlights);
    await db.delete(flights);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
});
```

---

*Testing analysis: 2026-02-19*
