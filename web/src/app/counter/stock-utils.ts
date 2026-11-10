/** Rules shared by the canteen and stock screens. Kept as plain functions so they are easy to test. */

export interface StockProduct {
  stock_qty: number;
  low_stock_level: number;
  track_stock: boolean;
}

/** Quantity of each product already promised on open tabs (running, paused or ended sessions). */
export function reservedByProduct(
  tabs: { session_id: number; product_id: number; qty: number }[],
  openSessionIds: Set<number>,
): Map<number, number> {
  const reserved = new Map<number, number>();
  for (const t of tabs) {
    if (!openSessionIds.has(t.session_id)) continue;
    reserved.set(t.product_id, (reserved.get(t.product_id) ?? 0) + t.qty);
  }
  return reserved;
}

/**
 * How many can still be sold: stock minus what open tabs already hold.
 * null means "no limit" (the product is not stock-tracked).
 */
export function availableQty(p: StockProduct, reserved: number): number | null {
  return p.track_stock ? Math.max(0, p.stock_qty - reserved) : null;
}

/** Low stock = tracked and at or below its alert level (FR-18). */
export function isLowStock(p: StockProduct): boolean {
  return p.track_stock && p.stock_qty <= p.low_stock_level;
}

export type MoveType = 'purchase' | 'wastage' | 'adjust';

/** The signed change a stock dialog entry makes to stock. */
export function stockDelta(type: MoveType, qty: number): number {
  return type === 'wastage' ? -Math.abs(qty) : type === 'purchase' ? Math.abs(qty) : qty;
}
