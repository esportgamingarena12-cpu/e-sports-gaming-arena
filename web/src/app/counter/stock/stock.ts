import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { formatIst } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';
import { CounterStore, Product } from '../counter.store';
import { isLowStock, MoveType } from '../stock-utils';
import { StockDialog } from './stock-dialog';

interface LogRow {
  id: number;
  created_at: string;
  move_type: string;
  qty: number;
  note: string | null;
  product_name: string;
  user_name: string;
  bill_no: number | null;
}

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Stock in',
  sale: 'Sale',
  wastage: 'Wastage',
  adjust: 'Adjustment',
  void: 'Void restore',
};

@Component({
  selector: 'app-stock',
  imports: [StockDialog],
  providers: [CounterStore],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Stock</h1>
        <span class="text-xs" [class]="store.live() ? 'text-emerald-400' : 'text-amber-400'">
          {{ store.live() ? '● Live' : '● Connecting…' }}
        </span>
      </div>

      @if (store.error(); as e) { <p class="mt-3 rounded bg-red-500/15 p-2 text-sm text-red-300" role="alert">{{ e }}</p> }

      @if (lowStock().length) {
        <div class="mt-3 rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200" role="alert" data-low-stock-banner>
          <p class="font-medium">Low stock: {{ lowStock().length }} item{{ lowStock().length === 1 ? '' : 's' }} at or below the alert level</p>
          <p class="mt-1">{{ lowNames() }}</p>
        </div>
      }

      @if (!store.loaded()) {
        <p class="mt-4 text-slate-400">Loading…</p>
      } @else {
        <ul class="mt-4 space-y-2" data-stock-list>
          @for (p of store.products(); track p.id) {
            <li class="card flex flex-wrap items-center gap-3" [class.opacity-60]="!p.active" [attr.data-product]="p.name">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ p.name }}
                  @if (!p.active) { <span class="text-xs text-slate-400">(inactive)</span> }
                </p>
                <p class="text-sm text-slate-400">
                  {{ p.category }} ·
                  @if (p.track_stock) {
                    stock <span data-stock [class]="low(p) ? 'font-semibold text-amber-400' : 'text-slate-200'">{{ p.stock_qty }}</span>
                    (alert at {{ p.low_stock_level }})
                    @if (low(p)) { <span class="ml-1 rounded bg-amber-500/20 px-1 text-xs text-amber-300">LOW</span> }
                  } @else { not tracked }
                </p>
              </div>
              @if (p.track_stock) {
                <div class="flex gap-2">
                  <button type="button" class="btn" (click)="open(p, 'purchase')">Stock in</button>
                  <button type="button" class="btn" (click)="open(p, 'wastage')">Wastage</button>
                  <button type="button" class="btn" (click)="open(p, 'adjust')">Adjust</button>
                </div>
              }
            </li>
          } @empty {
            <li class="text-slate-400">No products yet. Admin adds them under Admin → Products.</li>
          }
        </ul>

        <h2 class="mt-6 text-lg font-semibold">Last 50 movements</h2>
        @if (logError()) { <p class="mt-2 text-sm text-red-300" role="alert">{{ logError() }}</p> }
        <ul class="mt-2 divide-y divide-slate-800" data-stock-log>
          @for (m of log(); track m.id) {
            <li class="py-2 text-sm">
              <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate font-medium">{{ m.product_name }}</span>
                <span class="font-mono" [class]="m.qty > 0 ? 'text-emerald-300' : 'text-red-300'">{{ m.qty > 0 ? '+' : '' }}{{ m.qty }}</span>
              </div>
              <p class="text-xs text-slate-400">
                {{ typeLabel(m.move_type) }} · {{ m.user_name }} · {{ when(m.created_at) }}
                @if (m.note) { · {{ m.note }} }
              </p>
            </li>
          } @empty {
            <li class="py-2 text-slate-400">No movements yet.</li>
          }
        </ul>
      }

      @if (dialog(); as d) {
        <app-stock-dialog [product]="d.product" [initialType]="d.type" (saved)="refresh()" (closed)="dialog.set(null)" />
      }
    </section>
  `,
})
export class StockScreen implements OnInit, OnDestroy {
  protected readonly store = inject(CounterStore);
  private readonly sb = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);

  protected readonly log = signal<LogRow[]>([]);
  protected readonly logError = signal<string | null>(null);
  protected readonly dialog = signal<{ product: Product; type: MoveType } | null>(null);

  protected readonly lowStock = computed(() => this.store.products().filter((p) => p.active && isLowStock(p)));
  protected readonly lowNames = computed(() => this.lowStock().map((p) => `${p.name} (${p.stock_qty})`).join(', '));

  constructor() {
    // Reload the log whenever anything changes anywhere (Realtime), and once on load.
    effect(() => {
      this.store.changes();
      void this.loadLog();
    });
  }

  ngOnInit(): void {
    this.store.start();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  protected low(p: Product): boolean {
    return isLowStock(p);
  }

  protected typeLabel(t: string): string {
    return TYPE_LABEL[t] ?? t;
  }

  protected when(iso: string): string {
    return formatIst(iso);
  }

  protected open(product: Product, type: MoveType): void {
    this.dialog.set({ product, type });
  }

  protected async refresh(): Promise<void> {
    await this.store.load();
    await this.loadLog();
    this.toast.success('Stock updated');
  }

  private async loadLog(): Promise<void> {
    const { data, error } = await this.sb.rpc('recent_stock_moves', { p_limit: 50 });
    if (error) {
      this.logError.set(friendlyError(error));
      return;
    }
    this.logError.set(null);
    this.log.set((data ?? []) as LogRow[]);
  }
}
