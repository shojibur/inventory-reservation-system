import { describe, it, expect } from "vitest";
import { ReservationStatus } from "../../src/domain/ReservationStatus";
import { Reservation } from "../../src/domain/Reservation";
import { InvalidReservationStateError } from "../../src/domain/errors";

describe("Reservation", () => {
  it("reports whether the reservation has expired", () => {
    const reservation = new Reservation({
      id: "res-1",
      productId: "product-1",
      userId: "user-1",
      quantity: 1,
      createdAt: new Date("2026-09-10T12:00:00Z"),
      expiresAt: new Date("2026-09-10T12:02:00Z"),
    });

    expect(reservation.isExpired(new Date("2026-09-10T12:01:59Z"))).toBe(false);

    expect(reservation.isExpired(new Date("2026-09-10T12:02:00Z"))).toBe(true);
  });

  it("can expire an active reservation after its expiry time", () => {
    const reservation = new Reservation({
      id: "res-1",
      productId: "product-1",
      userId: "user-1",
      quantity: 1,
      createdAt: new Date("2026-09-10T12:00:00Z"),
      expiresAt: new Date("2026-09-10T12:02:00Z"),
    });

    reservation.expire(new Date("2026-09-10T12:03:00Z"));

    expect(reservation.status).toBe(ReservationStatus.EXPIRED);
  });

  it("cannot expire a reservation before its expiry time", () => {
    const reservation = new Reservation({
      id: "res-1",
      productId: "product-1",
      userId: "user-1",
      quantity: 1,
      createdAt: new Date("2026-09-10T12:00:00Z"),
      expiresAt: new Date("2026-09-10T12:02:00Z"),
    });

    expect(() => reservation.expire(new Date("2026-09-10T12:01:00Z"))).toThrow(
      InvalidReservationStateError,
    );
  });

  it("cannot expire a confirmed reservation", () => {
    const reservation = new Reservation({
      id: "res-1",
      productId: "product-1",
      userId: "user-1",
      quantity: 1,
      createdAt: new Date("2026-09-10T12:00:00Z"),
      expiresAt: new Date("2026-09-10T12:02:00Z"),
    });

    reservation.confirm(new Date("2026-09-10T12:01:00Z"));

    expect(() => reservation.expire(new Date("2026-09-10T12:03:00Z"))).toThrow(
      InvalidReservationStateError,
    );
  });
});
