import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../shared/toast.service';
import { cartCount, cartTotal } from '../cart';
import { CartService } from '../cart.service';
import { CounterStore, Product } from '../counter.store';
import { availableQty } from '../stock-utils';

@Component({
  selector: 'app-canteen',
  providers: [CounterStore],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Canteen</h1>
        <span class="text-xs" [class]="store.live() ? 'text-emerald-400' : 'text-amber-400'">
          {{ store.live() ? '● Live' : '● Connecting…' }}
        </span>
      </div>

      @if (store.error(); as e) { <p class="mt-3 rounded bg-red-500/15 p-2 text-sm text-red-300" role="alert">{{ e }}</p> }

      <!-- Bill to + cart -->
      <div class="card mt-3 space-y-3">
        <label class="label">Bill to
          <select class="field" (change)="setTarget($any($event.target).value)" data-bill-to>
            <option value="walkin" [selected]="targetValue() === 'walkin'">Walk-in customer</option>
            @for (t of openTabs(); track t.id) {
              <option [value]="t.id" [selected]="targetValue() === '' + t.id">{{ t.label }}</option>
            }
          </select>
        </label>

        @if (selectedTab(); as tab) {
          <div>
            <p class="text-sm font-medium">On {{ tab.stationName }}'s tab</p>
            @if (tabLines().length === 0) {
              <p class="text-sm text-slate-400">Nothing on this tab yet.</p>
            }
            <ul class="divide-y divide-slate-800" data-tab-lines>
              @for (l of tabLines(); track l.product_id) {
                <li class="flex items-center gap-2 py-1 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ l.qty }}× {{ l.name }}</span>
                  <span class="text-slate-400">₹{{ (l.price * l.qty).toFixed(2) }}</span>
                  <button type="button" class="btn !px-2 !py-0.5" [disabled]="busy()" (click)="removeFromTab(l.product_id, 1)" aria-label="Remove one">−1</button>
                  <button type="button" class="btn !px-2 !py-0.5 text-red-300" [disabled]="busy()" (click)="removeFromTab(l.product_id, null)" aria-label="Remove all">✕</button>
                </li>
              }
            </ul>
          </div>
        }

        <div>
          <p class="text-sm font-medium">Cart ({{ count() }})</p>
          @if (cartView().length === 0) {
            <p class="text-sm text-slate-400">Tap products to add them.</p>
          }
          <ul class="divide-y divide-slate-800" data-cart-lines>
            @for (l of cartView(); track l.product.id) {
              <li class="flex items-center gap-2 py-1 text-sm">
                <span class="min-w-0 flex-1 truncate">{{ l.product.name }}</span>
                <button type="button" class="btn !px-2 !py-0.5" (click)="cart.dec(l.product.id)" aria-label="Fewer">−</button>
                <span class="w-6 text-center" data-qty>{{ l.qty }}</span>
                <button type="button" class="btn !px-2 !py-0.5" [disabled]="!l.canAddMore" (click)="add(l.product)" aria-label="More">+</button>
                <span class="w-16 text-right">₹{{ (l.product.price * l.qty).toFixed(2) }}</span>
              </li>
            }
          </ul>
          @if (cartView().length) {
            <div class="mt-2 flex items-center justify-between gap-2">
              <span class="font-semibold" data-cart-total>Total ₹{{ total().toFixed(2) }}</span>
              <div class="flex gap-2">
                <button type="button" class="btn" (click)="cart.clear()">Clear</button>
                @if (selectedTab()) {
                  <button type="button" class="btn-primary" [disabled]="busy()" (click)="addToTab()">{{ busy() ? 'Adding…' : 'Add to tab' }}</button>
                } @else {
                  <button type="button" class="btn-primary" (click)="checkout()">Checkout</button>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="mt-4 space-y-2">
        <input type="search" placeholder="Search products" class="field !mt-0" [value]="search()"
               (input)="search.set($any($event.target).value)" aria-label="Search products" />
        <div class="flex gap-2 overflow-x-auto pb-1">
          @for (c of categories(); track c) {
            <button type="button" class="whitespace-nowrap rounded-full border px-3 py-1 text-sm"
                    [class]="category() === c ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 text-slate-300'"
                    (click)="category.set(c)">{{ c }}</button>
          }
        </div>
      </div>

      <!-- Product grid -->
      @if (!store.loaded()) {
        <p class="mt-4 text-slate-400">Loading…</p>
      } @else {
        <ul class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-products>
          @for (v of visible(); track v.product.id) {
            <li>
              <button type="button" class="card h-full w-full text-left disabled:opacity-40"
                      [disabled]="!v.canAdd" (click)="add(v.product)" [attr.data-product]="v.product.name">
                <p class="truncate font-medium">{{ v.product.name }}</p>
                <p class="text-sm text-slate-300">₹{{ v.product.price }}</p>
                <p class="text-xs" [class]="v.left === null ? 'text-slate-500' : v.left <= 0 ? 'text-red-400' : 'text-slate-400'">
                  @if (v.left === null) { not tracked } @else if (v.left <= 0) { Out of stock } @else { {{ v.left }} available }
                </p>
              </button>
            </li>
          } @empty {
            <li class="col-span-full text-slate-400">No products match.</li>
          }
        </ul>
      }
    </section>
  `,
})
export class Canteen implements OnInit, OnDestroy {
  protected readonly store = inject(CounterStore);
  protected readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly search = signal('');
  protected readonly category = signal('All');
  protected readonly busy = signal(false);
  private preselected = false;

  /** The open session whose tab is selected (falls back to walk-in if it is no longer open). */
  protected readonly selectedTab = computed(() => {
    const t = this.cart.target();
    if (t === 'walkin') return null;
    const s = this.store.sessions().find((x) => x.id === t);
    if (!s) return null;
    return { id: s.id, stationName: this.store.stationById().get(s.station_id)?.name ?? 'station' };
  });
  protected readonly targetValue = computed(() => String(this.selectedTab()?.id ?? 'walkin'));

  protected readonly openTabs = computed(() =>
    this.store.stations().flatMap((st) => {
      const s = this.store.sessionByStation().get(st.id);
      if (!s) return [];
      const who = s.customer_name ? ` · ${s.customer_name}` : '';
      return [{ id: s.id, label: `${st.name}${who} (${s.status})` }];
    }),
  );

  protected readonly tabLines = computed(() => {
    const id = this.selectedTab()?.id;
    return id === undefined ? [] : this.store.tabs().filter((t) => t.session_id === id);
  });

  private readonly activeProducts = computed(() => this.store.products().filter((p) => p.active));
  protected readonly categories = computed(() => [
    'All',
    ...[...new Set(this.activeProducts().map((p) => p.category))].sort(),
  ]);

  private inCart(productId: number): number {
    return this.cart.lines().find((l) => l.productId === productId)?.qty ?? 0;
  }

  /** How many can be sold in total right now (null = unlimited). */
  private maxFor(p: Product): number | null {
    return availableQty(p, this.store.reserved().get(p.id) ?? 0);
  }

  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.category();
    return this.activeProducts()
      .filter((p) => (cat === 'All' || p.category === cat) && (q === '' || p.name.toLowerCase().includes(q)))
      .map((product) => {
        const max = this.maxFor(product);
        const left = max === null ? null : max - this.inCart(product.id);
        return { product, left, canAdd: left === null || left > 0 };
      });
  });

  protected readonly cartView = computed(() =>
    this.cart
      .lines()
      .flatMap((l) => {
        const product = this.store.products().find((p) => p.id === l.productId);
        if (!product) return [];
        const max = this.maxFor(product);
        return [{ product, qty: l.qty, canAddMore: max === null || l.qty < max }];
      }),
  );
  protected readonly count = computed(() => cartCount(this.cart.lines()));
  protected readonly total = computed(() =>
    cartTotal(this.cart.lines(), (id) => this.store.products().find((p) => p.id === id)?.price ?? 0),
  );

  constructor() {
    // "+ Items" on a station card opens this screen with that session's tab selected.
    effect(() => {
      if (this.preselected) return;
      const tab = Number(this.route.snapshot.queryParamMap.get('tab'));
      if (!tab) {
        this.preselected = true;
      } else if (this.store.sessions().some((s) => s.id === tab)) {
        this.cart.target.set(tab);
        this.preselected = true; // only once: later changes are the staff member's own choice
      }
    });
    // A cart line can outgrow the stock if other counters sell the same item: trim it.
    effect(() => {
      for (const l of this.cart.lines()) {
        const p = this.store.products().find((x) => x.id === l.productId);
        const max = p ? this.maxFor(p) : null;
        if (max !== null && l.qty > max) {
          for (let i = l.qty; i > max; i--) this.cart.dec(l.productId);
        }
      }
    });
  }

  ngOnInit(): void {
    this.store.start();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  protected setTarget(value: string): void {
    this.cart.target.set(value === 'walkin' ? 'walkin' : Number(value));
  }

  protected add(p: Product): void {
    this.cart.add(p.id, this.maxFor(p));
  }

  protected checkout(): void {
    this.toast.success('Checkout arrives in a later phase');
  }

  protected async addToTab(): Promise<void> {
    const sid = this.selectedTab()?.id;
    if (sid === undefined) return;
    this.busy.set(true);
    for (const line of [...this.cart.lines()]) {
      const err = await this.store.call('add_tab_item', { p_session: sid, p_product: line.productId, p_qty: line.qty });
      if (err) {
        const name = this.store.products().find((p) => p.id === line.productId)?.name ?? 'Item';
        this.toast.error(`${name}: ${err}`);
        this.busy.set(false);
        return; // lines not yet added stay in the cart
      }
      this.cart.remove(line.productId);
    }
    this.busy.set(false);
    this.toast.success('Added to tab');
  }

  protected async removeFromTab(productId: number, qty: number | null): Promise<void> {
    const sid = this.selectedTab()?.id;
    if (sid === undefined) return;
    this.busy.set(true);
    const err = await this.store.call('remove_tab_item', { p_session: sid, p_product: productId, p_qty: qty });
    this.busy.set(false);
    if (err) this.toast.error(err);
  }
}
