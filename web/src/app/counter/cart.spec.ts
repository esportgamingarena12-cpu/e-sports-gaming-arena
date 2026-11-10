import { addToCart, cartCount, cartTotal, decFromCart, removeFromCart } from './cart';

describe('cart rules', () => {
  it('adds units up to the available quantity and no further', () => {
    let cart = addToCart([], 1, 2);
    cart = addToCart(cart, 1, 2);
    expect(cart).toEqual([{ productId: 1, qty: 2 }]);
    expect(addToCart(cart, 1, 2)).toEqual(cart); // refused: only 2 available
  });

  it('an out-of-stock product cannot be added', () => {
    expect(addToCart([], 1, 0)).toEqual([]);
  });

  it('an untracked product has no limit', () => {
    let cart = addToCart([], 1, null);
    for (let i = 0; i < 49; i++) cart = addToCart(cart, 1, null);
    expect(cartCount(cart)).toBe(50);
  });

  it('keeps other lines when adding and removing', () => {
    let cart = addToCart([], 1, 5);
    cart = addToCart(cart, 2, 5);
    cart = addToCart(cart, 2, 5);
    expect(cart).toEqual([
      { productId: 1, qty: 1 },
      { productId: 2, qty: 2 },
    ]);
    cart = decFromCart(cart, 2);
    expect(cart.find((l) => l.productId === 2)?.qty).toBe(1);
    cart = decFromCart(cart, 1);
    expect(cart.find((l) => l.productId === 1)).toBeUndefined();
    expect(removeFromCart(cart, 2)).toEqual([]);
  });

  it('totals in paise without drift', () => {
    const prices: Record<number, number> = { 1: 0.1, 2: 0.2, 3: 50 };
    const cart = [
      { productId: 1, qty: 3 },
      { productId: 2, qty: 3 },
      { productId: 3, qty: 2 },
    ];
    expect(cartTotal(cart, (id) => prices[id])).toBe(100.9);
  });
});
