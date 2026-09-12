import { describe, it, expect } from "vitest";
import { ReservationService } from "../../src/application/ReservationService";
import { InventoryItem } from "../../src/domain/InventoryItem";
import { ReservationStatus } from "../../src/domain/ReservationStatus";
import { InMemoryInventoryRepository } from "../../src/infrastructure/InMemoryInventoryRepository";
import { InMemoryReservationRepository } from "../../src/infrastructure/InMemoryReservationRepository";

const NOW = new Date("2026-09-12T10:00:00Z");

function makeService(productId: string, stock: number) {
  const inventoryRepo = new InMemoryInventoryRepository();
  const reservationRepo = new InMemoryReservationRepository();
  inventoryRepo.save(new InventoryItem({ productId, totalStock: stock }));
  return { service: new ReservationService(inventoryRepo, reservationRepo), inventoryRepo };
}

describe("Level 3 – Concurrency Handling", () => {
  it("exactly 1 success and 499 failures when 500 users race for stock = 1", async () => {
    const { service, inventoryRepo } = makeService("flash-product", 1);

    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        service.reserve({
          reservationId: `res-${i}`,
          productId: "flash-product",
          userId: `user-${i}`,
          quantity: 1,
          now: NOW,
        }),
      ),
    );

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(499);

    if (successes[0]?.success) {
      expect(successes[0].reservation.status).toBe(ReservationStatus.ACTIVE);
    }

    expect(inventoryRepo.findByProductId("flash-product")?.availableStock).toBeGreaterThanOrEqual(0);
  });

  it("exactly N successes when N users race for stock = N out of a larger pool", async () => {
    const N = 10;
    const { service, inventoryRepo } = makeService("multi-product", N);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        service.reserve({
          reservationId: `res-${i}`,
          productId: "multi-product",
          userId: `user-${i}`,
          quantity: 1,
          now: NOW,
        }),
      ),
    );

    expect(results.filter((r) => r.success)).toHaveLength(N);
    expect(inventoryRepo.findByProductId("multi-product")?.availableStock).toBe(0);
  });

  it("stock never goes negative under concurrent load", async () => {
    const { service, inventoryRepo } = makeService("oversell-check", 5);

    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        service.reserve({
          reservationId: `res-${i}`,
          productId: "oversell-check",
          userId: `user-${i}`,
          quantity: 1,
          now: NOW,
        }),
      ),
    );

    const item = inventoryRepo.findByProductId("oversell-check");
    expect(item?.availableStock).toBeGreaterThanOrEqual(0);
    expect(item?.activeReservationQuantity).toBeLessThanOrEqual(5);
  });

  it("concurrent operations on different products do not interfere", async () => {
    const inventoryRepo = new InMemoryInventoryRepository();
    const reservationRepo = new InMemoryReservationRepository();
    inventoryRepo.save(new InventoryItem({ productId: "product-X", totalStock: 1 }));
    inventoryRepo.save(new InventoryItem({ productId: "product-Y", totalStock: 1 }));
    const service = new ReservationService(inventoryRepo, reservationRepo);

    const [resultsX, resultsY] = await Promise.all([
      Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          service.reserve({ reservationId: `res-X-${i}`, productId: "product-X", userId: `user-X-${i}`, quantity: 1, now: NOW }),
        ),
      ),
      Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          service.reserve({ reservationId: `res-Y-${i}`, productId: "product-Y", userId: `user-Y-${i}`, quantity: 1, now: NOW }),
        ),
      ),
    ]);

    expect(resultsX.filter((r) => r.success)).toHaveLength(1);
    expect(resultsY.filter((r) => r.success)).toHaveLength(1);
  });

  it("mix of reserve, confirm, and cancel under concurrent load maintains consistency", async () => {
    const { service, inventoryRepo } = makeService("busy-product", 3);

    const r0 = await service.reserve({ reservationId: "base-0", productId: "busy-product", userId: "u0", quantity: 1, now: NOW });
    const r1 = await service.reserve({ reservationId: "base-1", productId: "busy-product", userId: "u1", quantity: 1, now: NOW });
    const r2 = await service.reserve({ reservationId: "base-2", productId: "busy-product", userId: "u2", quantity: 1, now: NOW });
    expect(r0.success && r1.success && r2.success).toBe(true);

    await Promise.all([
      service.confirm("base-0", NOW),
      service.cancel("base-1"),
      ...Array.from({ length: 10 }, (_, i) =>
        service.reserve({ reservationId: `new-${i}`, productId: "busy-product", userId: `new-user-${i}`, quantity: 1, now: NOW }),
      ),
    ]);

    const item = inventoryRepo.findByProductId("busy-product");
    expect(item?.availableStock).toBeGreaterThanOrEqual(0);
    expect(item?.confirmedSales).toBe(1);
  });
});
