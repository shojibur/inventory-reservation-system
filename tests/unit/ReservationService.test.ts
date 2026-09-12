import { describe, it, expect, beforeEach } from "vitest";
import { ReservationService } from "../../src/application/ReservationService";
import { InventoryItem } from "../../src/domain/InventoryItem";
import { ReservationStatus } from "../../src/domain/ReservationStatus";
import { InvalidReservationStateError } from "../../src/domain/errors";
import { InMemoryInventoryRepository } from "../../src/infrastructure/InMemoryInventoryRepository";
import { InMemoryReservationRepository } from "../../src/infrastructure/InMemoryReservationRepository";

const T0 = new Date("2026-09-12T10:00:00Z");
const T1 = new Date("2026-09-12T10:01:00Z"); // +1 min  (within TTL)
const T3 = new Date("2026-09-12T10:03:00Z"); // +3 min  (past 2-min TTL)

let idCounter = 0;
function nextId() {
  return `res-${++idCounter}`;
}

function makeService(productId: string, stock: number) {
  const inventoryRepo = new InMemoryInventoryRepository();
  const reservationRepo = new InMemoryReservationRepository();
  inventoryRepo.save(new InventoryItem({ productId, totalStock: stock }));
  const service = new ReservationService(inventoryRepo, reservationRepo);
  return { service, inventoryRepo };
}

// ─── Level 1: Basic Inventory Reservation ────────────────────────────────────

describe("Level 1 – Basic Inventory Reservation", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("succeeds when stock is available", async () => {
    const { service } = makeService("product-A", 5);

    const result = await service.reserve({
      reservationId: nextId(),
      productId: "product-A",
      userId: "user-1",
      quantity: 3,
      now: T0,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reservation.status).toBe(ReservationStatus.ACTIVE);
      expect(result.reservation.quantity).toBe(3);
    }
  });

  it("rejects when stock is insufficient", async () => {
    const { service } = makeService("product-A", 1);

    await service.reserve({
      reservationId: nextId(),
      productId: "product-A",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });

    const result = await service.reserve({
      reservationId: nextId(),
      productId: "product-A",
      userId: "user-2",
      quantity: 1,
      now: T0,
    });

    expect(result.success).toBe(false);
  });

  it("only one user can reserve the last item", async () => {
    const { service } = makeService("product-B", 1);

    const [r1, r2] = await Promise.all([
      service.reserve({ reservationId: nextId(), productId: "product-B", userId: "user-1", quantity: 1, now: T0 }),
      service.reserve({ reservationId: nextId(), productId: "product-B", userId: "user-2", quantity: 1, now: T0 }),
    ]);

    const successes = [r1, r2].filter((r) => r.success).length;
    expect(successes).toBe(1);
  });

  it("returns failure for an unknown product", async () => {
    const { service } = makeService("product-A", 5);

    const result = await service.reserve({
      reservationId: nextId(),
      productId: "no-such-product",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });

    expect(result.success).toBe(false);
  });

  it("available stock decreases after each successful reservation", async () => {
    const { service, inventoryRepo } = makeService("product-C", 10);

    await service.reserve({ reservationId: nextId(), productId: "product-C", userId: "u1", quantity: 3, now: T0 });
    await service.reserve({ reservationId: nextId(), productId: "product-C", userId: "u2", quantity: 4, now: T0 });

    expect(inventoryRepo.findByProductId("product-C")?.availableStock).toBe(3);
  });
});

// ─── Level 2: Reservation Lifecycle & Expiry ─────────────────────────────────

describe("Level 2 – Reservation Lifecycle & Expiry", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("confirming moves status to CONFIRMED and records a sale", async () => {
    const { service, inventoryRepo } = makeService("product-D", 2);

    const r = await service.reserve({
      reservationId: nextId(),
      productId: "product-D",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;

    await service.confirm(r.reservation.id, T1);

    expect(r.reservation.status).toBe(ReservationStatus.CONFIRMED);
    const item = inventoryRepo.findByProductId("product-D");
    expect(item?.confirmedSales).toBe(1);
    expect(item?.activeReservationQuantity).toBe(0);
  });

  it("cancelling releases inventory back to available", async () => {
    const { service, inventoryRepo } = makeService("product-E", 1);

    const r = await service.reserve({
      reservationId: nextId(),
      productId: "product-E",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;

    await service.cancel(r.reservation.id);

    expect(r.reservation.status).toBe(ReservationStatus.CANCELLED);
    expect(inventoryRepo.findByProductId("product-E")?.availableStock).toBe(1);
  });

  it("expired reservations automatically release inventory", async () => {
    const { service, inventoryRepo } = makeService("product-F", 1);

    const r = await service.reserve({
      reservationId: nextId(),
      productId: "product-F",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });
    expect(r.success).toBe(true);

    const expired = await service.expireStale("product-F", T3);

    expect(expired).toHaveLength(1);
    expect(inventoryRepo.findByProductId("product-F")?.availableStock).toBe(1);
  });

  it("a new reservation succeeds after the previous one expires", async () => {
    const { service } = makeService("product-G", 1);

    await service.reserve({
      reservationId: nextId(),
      productId: "product-G",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });

    // T3 is past the 2-min TTL — doReserve auto-expires stale reservations
    const r2 = await service.reserve({
      reservationId: nextId(),
      productId: "product-G",
      userId: "user-2",
      quantity: 1,
      now: T3,
    });

    expect(r2.success).toBe(true);
  });

  it("cannot confirm an expired reservation", async () => {
    const { service } = makeService("product-H", 1);

    const r = await service.reserve({
      reservationId: nextId(),
      productId: "product-H",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;

    await expect(service.confirm(r.reservation.id, T3)).rejects.toThrow(
      InvalidReservationStateError,
    );
  });

  it("cannot cancel an already confirmed reservation", async () => {
    const { service } = makeService("product-I", 1);

    const r = await service.reserve({
      reservationId: nextId(),
      productId: "product-I",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;

    await service.confirm(r.reservation.id, T1);
    await expect(service.cancel(r.reservation.id)).rejects.toThrow(
      InvalidReservationStateError,
    );
  });

  it("confirmed purchases cannot be reversed", async () => {
    const { service, inventoryRepo } = makeService("product-J", 1);

    const r = await service.reserve({
      reservationId: nextId(),
      productId: "product-J",
      userId: "user-1",
      quantity: 1,
      now: T0,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;

    await service.confirm(r.reservation.id, T1);
    expect(inventoryRepo.findByProductId("product-J")?.confirmedSales).toBe(1);

    const r2 = await service.reserve({
      reservationId: nextId(),
      productId: "product-J",
      userId: "user-2",
      quantity: 1,
      now: T1,
    });
    expect(r2.success).toBe(false);
  });
});
