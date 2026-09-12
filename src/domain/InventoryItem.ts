import { InvalidReservationStateError } from "./errors.js";

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

type InventoryItemProps = {
  productId: string;
  totalStock: number;
};

export class InventoryItem {
  public readonly productId: string;
  private _totalStock: number;
  private _confirmedSales: number;
  private _activeReservationQuantity: number;

  constructor(props: InventoryItemProps) {
    if (props.totalStock < 0) {
      throw new InvalidReservationStateError("Total stock cannot be negative");
    }
    this.productId = props.productId;
    this._totalStock = props.totalStock;
    this._confirmedSales = 0;
    this._activeReservationQuantity = 0;
  }

  public get totalStock(): number {
    return this._totalStock;
  }

  public get confirmedSales(): number {
    return this._confirmedSales;
  }

  public get activeReservationQuantity(): number {
    return this._activeReservationQuantity;
  }

  // Available = Total − Confirmed Sales − Active Reservations
  public get availableStock(): number {
    return (
      this._totalStock - this._confirmedSales - this._activeReservationQuantity
    );
  }

  public reserveStock(quantity: number): void {
    if (quantity <= 0) {
      throw new InvalidReservationStateError("Quantity must be positive");
    }
    if (quantity > this.availableStock) {
      throw new InsufficientStockError(
        `Insufficient stock: requested ${quantity}, available ${this.availableStock}`,
      );
    }
    this._activeReservationQuantity += quantity;
  }

  public releaseReservation(quantity: number): void {
    this._activeReservationQuantity = Math.max(
      0,
      this._activeReservationQuantity - quantity,
    );
  }

  public confirmReservation(quantity: number): void {
    this._activeReservationQuantity = Math.max(
      0,
      this._activeReservationQuantity - quantity,
    );
    this._confirmedSales += quantity;
  }
}
