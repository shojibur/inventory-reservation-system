import { Reservation } from "../domain/Reservation.js";
import { ReservationStatus } from "../domain/ReservationStatus.js";
import { ReservationRepository } from "../ports/ReservationRepository.js";

export class InMemoryReservationRepository implements ReservationRepository {
  private readonly store = new Map<string, Reservation>();

  findById(id: string): Reservation | undefined {
    return this.store.get(id);
  }

  findActiveByProductId(productId: string): Reservation[] {
    const results: Reservation[] = [];
    for (const reservation of this.store.values()) {
      if (
        reservation.productId === productId &&
        reservation.status === ReservationStatus.ACTIVE
      ) {
        results.push(reservation);
      }
    }
    return results;
  }

  save(reservation: Reservation): void {
    this.store.set(reservation.id, reservation);
  }
}
