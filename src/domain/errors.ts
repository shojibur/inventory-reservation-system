export class InvalidReservationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReservationStateError";
  }
}
