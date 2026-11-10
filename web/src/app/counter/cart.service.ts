import { Injectable, signal } from '@angular/core';
import { addToCart, CartLine, decFromCart, removeFromCart } from './cart';

/**
 * The canteen cart. Lives for the whole session of the app, so it survives moving between
 * counter screens, but is cleared by a page reload or logout.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  readonly lines = signal<CartLine[]>([]);
  /** 'walkin' or the id of the open session whose tab receives the items. */
  readonly target = signal<'walkin' | number>('walkin');

  add(productId: number, max: number | null): void {
    this.lines.update((l) => addToCart(l, productId, max));
  }

  dec(productId: number): void {
    this.lines.update((l) => decFromCart(l, productId));
  }

  remove(productId: number): void {
    this.lines.update((l) => removeFromCart(l, productId));
  }

  clear(): void {
    this.lines.set([]);
  }
}
