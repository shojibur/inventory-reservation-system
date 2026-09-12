import { InventoryItem } from "../domain/InventoryItem.js";
import { InventoryRepository } from "../ports/InventoryRepository.js";

export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly store = new Map<string, InventoryItem>();

  findByProductId(productId: string): InventoryItem | undefined {
    return this.store.get(productId);
  }

  save(item: InventoryItem): void {
    this.store.set(item.productId, item);
  }
}
