import { describe, it, expect } from "vitest";
import { ReservationStatus } from "../../src/domain/ReservationStatus";

describe("Reservation", () => {
  it("defines ACTIVE as a valid reservation status", () => {
    expect(ReservationStatus.ACTIVE).toBe("ACTIVE");
  });
});
