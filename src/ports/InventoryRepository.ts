import { InventoryItem } from "../domain/InventoryItem.js";

export interface InventoryRepository {
  findByProductId(productId: string): InventoryItem | undefined;
  save(item: InventoryItem): void;
}
