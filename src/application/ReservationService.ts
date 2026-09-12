import { Reservation } from "../domain/Reservation.js";
import { InvalidReservationStateError } from "../domain/errors.js";
import { InventoryRepository } from "../ports/InventoryRepository.js";
import { ReservationRepository } from "../ports/ReservationRepository.js";

export type ReserveItemInput = {
  reservationId: string;
  productId: string;
  userId: string;
  quantity: number;
  now: Date;
  ttlMs?: number;
};

export type ReservationResult =
  | { success: true; reservation: Reservation }
  | { success: false; reason: string };

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

export class ReservationService {
  /**
   * Per-product lock implemented as a promise chain.
   *
   * Each product maps to the tail of its current chain. Every new operation
   * appends itself to that tail, so operations on the same product are
   * serialised while operations on different products run in parallel.
   * This makes the check-then-act sequence atomic, preventing overselling.
   */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
  ) {}

  async reserve(input: ReserveItemInput): Promise<ReservationResult> {
    return this.withProductLock(input.productId, () => this.doReserve(input));
  }

  async confirm(reservationId: string, now: Date): Promise<void> {
    const reservation = this.getReservationOrThrow(reservationId);
    return this.withProductLock(reservation.productId, () =>
      this.doConfirm(reservation, now),
    );
  }

  async cancel(reservationId: string): Promise<void> {
    const reservation = this.getReservationOrThrow(reservationId);
    return this.withProductLock(reservation.productId, () =>
      this.doCancel(reservation),
    );
  }

  async expireStale(productId: string, now: Date): Promise<Reservation[]> {
    return this.withProductLock(productId, () =>
      this.doExpireStale(productId, now),
    );
  }

  // ─── private ─────────────────────────────────────────────────────────────────

  private async doReserve(input: ReserveItemInput): Promise<ReservationResult> {
    const { reservationId, productId, userId, quantity, now, ttlMs } = input;

    const item = this.inventoryRepo.findByProductId(productId);
    if (item === undefined) {
      return { success: false, reason: `Product ${productId} not found` };
    }

    // Release any stale reservations before checking available stock so freed
    // inventory is immediately visible to this request.
    await this.doExpireStale(productId, now);

    if (item.availableStock < quantity) {
      return {
        success: false,
        reason: `Insufficient stock: requested ${quantity}, available ${item.availableStock}`,
      };
    }

    item.reserveStock(quantity);
    this.inventoryRepo.save(item);

    const expiresAt = new Date(now.getTime() + (ttlMs ?? DEFAULT_TTL_MS));
    const reservation = new Reservation({
      id: reservationId,
      productId,
      userId,
      quantity,
      createdAt: now,
      expiresAt,
    });

    this.reservationRepo.save(reservation);
    return { success: true, reservation };
  }

  private async doConfirm(reservation: Reservation, now: Date): Promise<void> {
    reservation.confirm(now);

    const item = this.inventoryRepo.findByProductId(reservation.productId);
    if (item === undefined) {
      throw new InvalidReservationStateError(
        `Product ${reservation.productId} not found`,
      );
    }

    item.confirmReservation(reservation.quantity);
    this.inventoryRepo.save(item);
    this.reservationRepo.save(reservation);
  }

  private async doCancel(reservation: Reservation): Promise<void> {
    reservation.cancel();

    const item = this.inventoryRepo.findByProductId(reservation.productId);
    if (item === undefined) {
      throw new InvalidReservationStateError(
        `Product ${reservation.productId} not found`,
      );
    }

    item.releaseReservation(reservation.quantity);
    this.inventoryRepo.save(item);
    this.reservationRepo.save(reservation);
  }

  private async doExpireStale(
    productId: string,
    now: Date,
  ): Promise<Reservation[]> {
    const active = this.reservationRepo.findActiveByProductId(productId);
    const expired: Reservation[] = [];
    const item = this.inventoryRepo.findByProductId(productId);

    for (const reservation of active) {
      if (reservation.isExpired(now)) {
        reservation.expire(now);
        expired.push(reservation);
        this.reservationRepo.save(reservation);
        item?.releaseReservation(reservation.quantity);
      }
    }

    if (item !== undefined && expired.length > 0) {
      this.inventoryRepo.save(item);
    }

    return expired;
  }

  private getReservationOrThrow(id: string): Reservation {
    const reservation = this.reservationRepo.findById(id);
    if (reservation === undefined) {
      throw new InvalidReservationStateError(`Reservation ${id} not found`);
    }
    return reservation;
  }

  private withProductLock<T>(
    productId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const current = this.locks.get(productId) ?? Promise.resolve();
    const next = current.then(() => fn());

    // Store a non-rejecting tail so the chain never breaks on error.
    this.locks.set(
      productId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );

    return next;
  }
}
