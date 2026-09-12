import { Reservation } from "../domain/Reservation.js";

export interface ReservationRepository {
  findById(id: string): Reservation | undefined;
  findActiveByProductId(productId: string): Reservation[];
  save(reservation: Reservation): void;
}
