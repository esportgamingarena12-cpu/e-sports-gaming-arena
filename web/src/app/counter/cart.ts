/** Pure cart rules for the canteen screen. */

export interface CartLine {
  productId: number;
  qty: number;
}

/** Adds one unit. `max` is how many can be sold in total (null = unlimited); the cart never exceeds it. */
export function addToCart(lines: CartLine[], productId: number, max: number | null): CartLine[] {
  const current = lines.find((l) => l.productId === productId)?.qty ?? 0;
  if (max !== null && current + 1 > max) return lines;
  if (current === 0) return [...lines, { productId, qty: 1 }];
  return lines.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
}

/** Removes one unit; the line disappears at zero. */
export function decFromCart(lines: CartLine[], productId: number): CartLine[] {
  return lines
    .map((l) => (l.productId === productId ? { ...l, qty: l.qty - 1 } : l))
    .filter((l) => l.qty > 0);
}

export function removeFromCart(lines: CartLine[], productId: number): CartLine[] {
  return lines.filter((l) => l.productId !== productId);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** Total in rupees, summed in paise to avoid floating point drift. */
export function cartTotal(lines: CartLine[], priceOf: (productId: number) => number): number {
  const paise = lines.reduce((sum, l) => sum + Math.round(priceOf(l.productId) * 100) * l.qty, 0);
  return paise / 100;
}
