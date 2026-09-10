import { InvalidReservationStateError } from "./errors.js";
import { ReservationStatus } from "./ReservationStatus.js";

type ReservationProps = {
  id: string;
  productId: string;
  userId: string;
  quantity: number;
  createdAt: Date;
  expiresAt: Date;
};

export class Reservation {
  public readonly id: string;
  public readonly productId: string;
  public readonly userId: string;
  public readonly quantity: number;
  public readonly createdAt: Date;
  public readonly expiresAt: Date;

  private _status: ReservationStatus;

  constructor(props: ReservationProps) {
    this.id = props.id;
    this.productId = props.productId;
    this.userId = props.userId;
    this.quantity = props.quantity;
    this.createdAt = props.createdAt;
    this.expiresAt = props.expiresAt;
    this._status = ReservationStatus.ACTIVE;
  }

  public get status(): ReservationStatus {
    return this._status;
  }

  public confirm(now: Date): void {
    if (this._status !== ReservationStatus.ACTIVE) {
      throw new InvalidReservationStateError(
        `Cannot confirm reservation in ${this._status} state`,
      );
    }

    if (this.isExpired(now)) {
      throw new InvalidReservationStateError(
        "Cannot confirm an expired reservation",
      );
    }

    this._status = ReservationStatus.CONFIRMED;
  }

  public cancel(): void {
    if (this._status !== ReservationStatus.ACTIVE) {
      throw new InvalidReservationStateError(
        `Cannot cancel reservation in ${this._status} state`,
      );
    }

    this._status = ReservationStatus.CANCELLED;
  }

  public isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  public expire(now: Date): void {
    if (this._status !== ReservationStatus.ACTIVE) {
      throw new InvalidReservationStateError(
        `Cannot expire reservation in ${this._status} state`,
      );
    }

    if (!this.isExpired(now)) {
      throw new InvalidReservationStateError(
        "Cannot expire reservation before its expiry time",
      );
    }

    this._status = ReservationStatus.EXPIRED;
  }
}
