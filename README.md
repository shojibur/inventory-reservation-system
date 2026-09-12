# Inventory Reservation System

A TypeScript implementation of a concurrent inventory reservation system that prevents overselling in high-demand flash sale scenarios.

---

## Approach

The challenge is broken into three progressive levels, each building on the last.

### Level 1 — Basic Inventory Reservation

An `InventoryItem` domain entity enforces the core business rule:

```
Available Stock = Total Stock − Confirmed Sales − Active Reservations
```

Any reservation request that would push available stock below zero is rejected immediately.

### Level 2 — Reservation Lifecycle & Expiry

A `Reservation` entity models a strict state machine:

```
ACTIVE → CONFIRMED  (user completes purchase within TTL)
ACTIVE → CANCELLED  (user explicitly cancels)
ACTIVE → EXPIRED    (TTL of 2 minutes elapses without action)
```

Invalid transitions (e.g. confirming an expired reservation) throw an `InvalidReservationStateError`. Expired reservations automatically release their held stock back to available inventory.

### Level 3 — Concurrency Handling

JavaScript is single-threaded but `async` operations introduce interleaving — two coroutines can both read `availableStock = 1`, both pass the check, and both write a reservation, causing overselling.

The `ReservationService` solves this with a **per-product promise-chain mutex**:

```
productId → Promise<void>  (tail of the current chain)
```

Every operation on a product appends itself to that product's chain via `.then()`. This means:

- Operations on the **same product** are serialised — no two run concurrently.
- Operations on **different products** run in parallel — no unnecessary blocking.
- The check-then-act sequence becomes atomic from the application's perspective.

The non-rejecting tail (`then(() => undefined, () => undefined)`) ensures a failed operation never breaks the chain for subsequent callers.

---

## Design Decisions

**Domain-Driven Design structure** — the codebase is split into `domain`, `ports`, `application`, and `infrastructure` layers. Business rules live exclusively in the domain; the application layer orchestrates; infrastructure is swappable.

**Port interfaces** — `InventoryRepository` and `ReservationRepository` are defined as interfaces in `src/ports/`. The in-memory implementations satisfy these contracts today; a Redis or PostgreSQL implementation could be dropped in without touching application logic.

**Dependency injection** — `ReservationService` receives its repositories via constructor, making it fully testable without mocking frameworks.

**Immutable reservation properties** — all fields on `Reservation` except `_status` are `readonly`. Only the state machine methods can mutate state, preventing accidental corruption.

**Auto-expiry on reserve** — `doReserve` calls `doExpireStale` before checking available stock. This means freed inventory from elapsed reservations is immediately visible to incoming requests without needing a background sweep.

---

## Assumptions

- Reservation TTL defaults to **2 minutes**; callers may override via `ttlMs`.
- A reservation ID is supplied by the caller (e.g. a UUID generated at the API layer) rather than generated internally — this keeps the domain free of ID-generation concerns.
- "Confirmed purchases cannot be reversed" means a `CONFIRMED` reservation has no cancel or refund path in this system.
- Persistence is in-memory for this challenge; state is lost on process restart.

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| Promise-chain mutex | Simple, zero-dependency, works in a single process. Would not work across multiple Node.js instances (would need Redis distributed lock). |
| In-memory storage | No persistence, no horizontal scaling. Sufficient for the challenge scope. |
| Auto-expiry on reserve | Keeps stock accurate without a background job, but adds a small sweep cost to every reserve call. |
| Synchronous repositories | Keeps the implementation simple. Real repositories would be `async` (DB calls), which the `withProductLock` wrapper already supports. |

---

## Areas to Improve With More Time

- **Distributed locking** — replace the in-memory mutex with a Redis-backed lock (e.g. Redlock) to support horizontally scaled deployments.
- **Persistent storage** — back the repositories with a database (PostgreSQL with `SELECT FOR UPDATE` or Redis atomic operations).
- **Background expiry sweep** — a scheduled job to expire stale reservations across all products, rather than relying solely on lazy expiry at reserve time.
- **Observability** — structured logging and metrics (reservation success/failure rates, stock levels, lock wait times).
- **API layer** — expose the service over HTTP (e.g. Express or Fastify) with request validation and proper error responses.

---

## AI Disclosure

This solution was built with **Claude** (Anthropic) as a coding assistant.

**How it was used:** Step-by-step implementation of individual layers — each file was implemented and committed separately with my review and approval at every step.

**Independently designed and authored (no AI):**
- Overall architecture — DDD layering (`domain`, `ports`, `application`, `infrastructure`)
- `Reservation` domain entity and state machine
- `ReservationStatus` enum and `InvalidReservationStateError`
- Initial test scaffolding and TDD approach
- Business rule interpretation from the requirements

**AI-assisted portions:** Implementation of `InventoryItem`, port interfaces, in-memory repositories, `ReservationService` (including the per-product promise-chain mutex pattern), unit and concurrency tests, and this README.

All AI-generated code was reviewed and understood before committing. The engineering decisions and overall solution design are my own.

---

## Running the Project

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Type-check
npm run typecheck
```
