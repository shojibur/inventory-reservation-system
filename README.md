# Inventory Reservation System

Prevents overselling in high-concurrency flash sale scenarios. Built in TypeScript with no runtime dependencies.

## Quick Start

```bash
npm install
npm test        # 21 tests across 3 files
npm run demo    # live walkthrough of all 3 levels
```

> The demo also runs on every push via GitHub Actions — see the **Run demo** step in the [Actions tab](../../actions) for live output.

---

## How It Works

### Level 1 — Basic Reservation
Enforces the stock formula on every request:
```
Available = Total Stock − Confirmed Sales − Active Reservations
```

### Level 2 — Reservation Lifecycle
Reservations follow a strict state machine with a 2-minute TTL:
```
ACTIVE → CONFIRMED   user completes purchase
ACTIVE → CANCELLED   user cancels
ACTIVE → EXPIRED     TTL elapses, stock released automatically
```

### Level 3 — Concurrency
A **per-product promise-chain mutex** serialises all operations on the same product, making check-then-act atomic. Operations on different products run in parallel.

```
500 users → 1 item in stock → 1 success, 499 rejections. Every time.
```

---

## Architecture

```
src/
├── domain/          # Business rules (Reservation, InventoryItem, errors)
├── ports/           # Interfaces (InventoryRepository, ReservationRepository)
├── application/     # ReservationService — orchestration + concurrency lock
└── infrastructure/  # InMemoryInventoryRepository, InMemoryReservationRepository
```

---

## Trade-offs & Future Improvements

| Now | With more time |
|---|---|
| In-process mutex | Redis distributed lock (Redlock) for multi-instance |
| In-memory storage | PostgreSQL / Redis with persistent repositories |
| Lazy expiry on reserve | Background sweep job across all products |

---

## AI Disclosure

Built with **Claude** (Anthropic) as a coding assistant.

**My work:** overall architecture, DDD layering, `Reservation` state machine, `ReservationStatus`, `InvalidReservationStateError`, initial test scaffolding, and all engineering decisions.

**AI-assisted:** `InventoryItem`, port interfaces, in-memory repositories, `ReservationService` (including the mutex pattern), unit/concurrency tests, demo script, and this README.

All AI output was reviewed and understood before committing.
