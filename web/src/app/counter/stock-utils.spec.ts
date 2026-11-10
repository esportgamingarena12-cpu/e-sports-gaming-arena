import { availableQty, isLowStock, reservedByProduct, stockDelta } from './stock-utils';

const tracked = (stock: number, low = 5) => ({ stock_qty: stock, low_stock_level: low, track_stock: true });

describe('stock utils', () => {
  it('adds up what open tabs hold and ignores other sessions', () => {
    const tabs = [
      { session_id: 1, product_id: 10, qty: 2 },
      { session_id: 2, product_id: 10, qty: 3 },
      { session_id: 3, product_id: 10, qty: 9 }, // billed session: not in the open set
      { session_id: 1, product_id: 11, qty: 1 },
    ];
    const reserved = reservedByProduct(tabs, new Set([1, 2]));
    expect(reserved.get(10)).toBe(5);
    expect(reserved.get(11)).toBe(1);
  });

  it('available = stock minus reserved, never negative', () => {
    expect(availableQty(tracked(10), 3)).toBe(7);
    expect(availableQty(tracked(2), 5)).toBe(0);
  });

  it('untracked products have no limit', () => {
    expect(availableQty({ stock_qty: 0, low_stock_level: 0, track_stock: false }, 0)).toBeNull();
  });

  it('low stock is at or below the alert level', () => {
    expect(isLowStock(tracked(6, 5))).toBe(false);
    expect(isLowStock(tracked(5, 5))).toBe(true);
    expect(isLowStock(tracked(0, 5))).toBe(true);
    expect(isLowStock({ stock_qty: 0, low_stock_level: 5, track_stock: false })).toBe(false);
  });

  it('computes the signed stock change', () => {
    expect(stockDelta('purchase', 24)).toBe(24);
    expect(stockDelta('wastage', 3)).toBe(-3);
    expect(stockDelta('adjust', -4)).toBe(-4);
    expect(stockDelta('adjust', 4)).toBe(4);
  });
});
