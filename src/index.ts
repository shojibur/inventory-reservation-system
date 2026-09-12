// Domain
export { Reservation } from "./domain/Reservation.js";
export { ReservationStatus } from "./domain/ReservationStatus.js";
export { InventoryItem, InsufficientStockError } from "./domain/InventoryItem.js";
export { InvalidReservationStateError } from "./domain/errors.js";

// Ports
export type { InventoryRepository } from "./ports/InventoryRepository.js";
export type { ReservationRepository } from "./ports/ReservationRepository.js";

// Application
export { ReservationService } from "./application/ReservationService.js";
export type { ReserveItemInput, ReservationResult } from "./application/ReservationService.js";

// Infrastructure
export { InMemoryInventoryRepository } from "./infrastructure/InMemoryInventoryRepository.js";
export { InMemoryReservationRepository } from "./infrastructure/InMemoryReservationRepository.js";
