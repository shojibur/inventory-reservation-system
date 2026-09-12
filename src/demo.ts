import { InventoryItem } from "./domain/InventoryItem.js";
import { ReservationService } from "./application/ReservationService.js";
import { InMemoryInventoryRepository } from "./infrastructure/InMemoryInventoryRepository.js";
import { InMemoryReservationRepository } from "./infrastructure/InMemoryReservationRepository.js";

const NOW = new Date("2026-09-12T10:00:00Z");
const AFTER_EXPIRY = new Date("2026-09-12T10:03:00Z");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function line() {
  console.log("─".repeat(60));
}

function heading(title: string) {
  line();
  console.log(`  ${title}`);
  line();
}

async function print(msg: string, delay = 400) {
  await sleep(delay);
  console.log(msg);
}

function makeService(productId: string, stock: number) {
  const inventoryRepo = new InMemoryInventoryRepository();
  const reservationRepo = new InMemoryReservationRepository();
  inventoryRepo.save(new InventoryItem({ productId, totalStock: stock }));
  return { service: new ReservationService(inventoryRepo, reservationRepo), inventoryRepo };
}

// ─── Scene 1: Basic reservation ──────────────────────────────────────────────

async function scene1() {
  heading("SCENE 1 — Basic Reservation (Level 1)");

  const { service, inventoryRepo } = makeService("product-A", 3);
  await print("  Product A  |  Total stock: 3\n");

  for (let i = 1; i <= 4; i++) {
    const result = await service.reserve({
      reservationId: `res-${i}`,
      productId: "product-A",
      userId: `user-${i}`,
      quantity: 1,
      now: NOW,
    });

    const stock = inventoryRepo.findByProductId("product-A")?.availableStock ?? 0;

    if (result.success) {
      await print(`  User ${i} → ✓ Reserved  |  Remaining stock: ${stock}`);
    } else {
      await print(`  User ${i} → ✗ Rejected  |  Reason: ${result.reason}`);
    }
  }
}

// ─── Scene 2: Lifecycle — confirm, cancel, expiry ────────────────────────────

async function scene2() {
  heading("SCENE 2 — Reservation Lifecycle (Level 2)");

  const { service, inventoryRepo } = makeService("product-B", 3);
  await print("  Product B  |  Total stock: 3\n");

  const r1 = await service.reserve({ reservationId: "r1", productId: "product-B", userId: "user-1", quantity: 1, now: NOW });
  const r2 = await service.reserve({ reservationId: "r2", productId: "product-B", userId: "user-2", quantity: 1, now: NOW });
  const r3 = await service.reserve({ reservationId: "r3", productId: "product-B", userId: "user-3", quantity: 1, now: NOW });

  await print("  User 1, 2, 3 all reserved 1 unit each");
  await print(`  Available stock: ${inventoryRepo.findByProductId("product-B")?.availableStock}\n`);

  if (r1.success) {
    await service.confirm(r1.reservation.id, NOW);
    await print("  User 1 → confirmed purchase ✓");
  }

  if (r2.success) {
    await service.cancel(r2.reservation.id);
    await print("  User 2 → cancelled reservation ✗");
  }

  await print(`\n  Available stock after confirm + cancel: ${inventoryRepo.findByProductId("product-B")?.availableStock}`);
  await print(`  Confirmed sales: ${inventoryRepo.findByProductId("product-B")?.confirmedSales}\n`);

  if (r3.success) {
    await print("  Waiting for User 3 reservation to expire (TTL elapsed)...", 1200);
    const expired = await service.expireStale("product-B", AFTER_EXPIRY);
    await print(`  ${expired.length} reservation(s) expired`);
    await print(`  Available stock after expiry: ${inventoryRepo.findByProductId("product-B")?.availableStock}`);
  }
}

// ─── Scene 3: 500 concurrent users, 1 item ───────────────────────────────────

async function scene3() {
  heading("SCENE 3 — 500 Concurrent Users, 1 Item in Stock (Level 3)");

  const { service, inventoryRepo } = makeService("flash-product", 1);
  await print("  Flash sale product  |  Total stock: 1");
  await print("  Firing 500 simultaneous reservation requests...", 600);

  // small pause so the "firing" line lands before results
  await sleep(800);

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
  const finalStock = inventoryRepo.findByProductId("flash-product")?.availableStock ?? 0;

  await print(`\n  ✓ Successful reservations : ${successes.length}`);
  await print(`  ✗ Rejected requests       : ${failures.length}`);
  await print(`  Remaining stock           : ${finalStock}`);
  await print(`\n  Overselling prevented     : ${successes.length === 1 && finalStock === 0 ? "YES ✓" : "NO ✗"}`, 600);
}

// ─── Scene 4: Expired stock becomes available again ──────────────────────────

async function scene4() {
  heading("SCENE 4 — Freed Stock After Expiry (Level 2 + Level 3)");

  const { service, inventoryRepo } = makeService("limited-product", 1);
  await print("  Limited product  |  Total stock: 1\n");

  const r1 = await service.reserve({
    reservationId: "r1",
    productId: "limited-product",
    userId: "user-1",
    quantity: 1,
    now: NOW,
  });
  await print(`  User 1 reserved the last item → ${r1.success ? "✓ success" : "✗ failed"}`);
  await print(`  Available stock: ${inventoryRepo.findByProductId("limited-product")?.availableStock}`);

  const r2 = await service.reserve({
    reservationId: "r2",
    productId: "limited-product",
    userId: "user-2",
    quantity: 1,
    now: NOW,
  });
  await print(`\n  User 2 tries immediately    → ${r2.success ? "✓ success" : "✗ rejected (as expected)"}`);

  await print("\n  2 minutes pass... User 1's reservation expires.", 1500);

  const r3 = await service.reserve({
    reservationId: "r3",
    productId: "limited-product",
    userId: "user-2",
    quantity: 1,
    now: AFTER_EXPIRY,
  });
  await print(`\n  User 2 tries again after expiry → ${r3.success ? "✓ success (stock released!)" : "✗ failed"}`);
  await print(`  Available stock: ${inventoryRepo.findByProductId("limited-product")?.availableStock}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n");
  heading("  INVENTORY RESERVATION SYSTEM — LIVE DEMO");
  console.log("\n");

  await scene1();
  await sleep(600);
  console.log();
  await scene2();
  await sleep(600);
  console.log();
  await scene3();
  await sleep(600);
  console.log();
  await scene4();

  await sleep(600);
  console.log();
  line();
  console.log("  Demo complete.");
  line();
  console.log();
}

main().catch(console.error);
