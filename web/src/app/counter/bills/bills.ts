import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { formatIst, inr, istDayRange, todayIst } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';
import { ReceiptService } from '../receipt/receipt.service';

interface BillRow {
  bill_no: number;
  created_at: string;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: 'paid' | 'void';
  void_reason: string | null;
  bill_items: { id: number; kind: string; name: string; qty: number; unit_price: number; amount: number }[];
  payments: { id: number; mode: string; amount: number; reference: string | null }[];
}

const MODE_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };

@Component({
  selector: 'app-bills',
  template: `
    <section class="p-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <h1 class="text-xl font-semibold">Bills</h1>
        <div class="flex items-end gap-2">
          <label class="label">Date
            <input type="date" class="field !mt-0 w-auto" [value]="day()" [max]="today" (change)="setDay($any($event.target).value)" data-date />
          </label>
          <button type="button" class="btn" (click)="load()" [disabled]="loading()">{{ loading() ? '…' : 'Refresh' }}</button>
        </div>
      </div>

      @if (error()) { <p class="mt-3 rounded bg-red-500/15 p-2 text-sm text-red-300" role="alert">{{ error() }}</p> }

      @if (!loaded()) {
        <p class="mt-4 text-slate-400">Loading…</p>
      } @else {
        <ul class="mt-4 space-y-2" data-bills>
          @for (b of bills(); track b.bill_no) {
            <li class="card" [attr.data-bill]="b.bill_no" [class.opacity-70]="b.status === 'void'">
              <button type="button" class="flex w-full items-center justify-between gap-2 text-left" (click)="toggle(b.bill_no)"
                      [attr.aria-expanded]="open() === b.bill_no">
                <span class="min-w-0">
                  <span class="font-semibold">Bill #{{ b.bill_no }}</span>
                  @if (b.status === 'void') { <span class="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300" data-void-badge>VOID</span> }
                  <span class="block truncate text-xs text-slate-400">
                    {{ when(b.created_at) }}{{ b.customer_name ? ' · ' + b.customer_name : '' }} · {{ modes(b) }}
                  </span>
                </span>
                <span class="shrink-0 text-lg font-semibold" [class.line-through]="b.status === 'void'">{{ money(b.total) }}</span>
              </button>

              @if (open() === b.bill_no) {
                <div class="mt-3 space-y-2 border-t border-slate-800 pt-3 text-sm">
                  <ul class="divide-y divide-slate-800">
                    @for (i of sortedItems(b); track i.id) {
                      <li class="flex justify-between gap-2 py-1">
                        <span class="min-w-0 truncate">{{ i.qty }}× {{ i.name }}</span><span>{{ money(i.amount) }}</span>
                      </li>
                    }
                  </ul>
                  <p class="flex justify-between"><span>Subtotal</span><span>{{ money(b.subtotal) }}</span></p>
                  @if (b.discount > 0) { <p class="flex justify-between"><span>Discount</span><span>-{{ money(b.discount) }}</span></p> }
                  <p class="flex justify-between font-semibold"><span>Total</span><span>{{ money(b.total) }}</span></p>
                  <ul class="text-slate-300">
                    @for (p of b.payments; track p.id) {
                      <li class="flex justify-between"><span>{{ label(p.mode) }}{{ p.reference ? ' (' + p.reference + ')' : '' }}</span><span>{{ money(p.amount) }}</span></li>
                    }
                  </ul>
                  @if (b.status === 'void') { <p class="text-red-300">Voided: {{ b.void_reason }}</p> }

                  @if (voiding() === b.bill_no) {
                    <div class="rounded border border-red-500/40 bg-red-500/10 p-2">
                      <label class="label">Reason for voiding (required)
                        <input class="field" [value]="reason()" (input)="reason.set($any($event.target).value)" data-void-reason />
                      </label>
                      <p class="mt-1 text-xs text-slate-300">Stock will be restored. The bill stays on record as VOID.</p>
                      <div class="mt-2 flex gap-2">
                        <button type="button" class="btn-primary !bg-red-500" [disabled]="busy() || !reason().trim()" (click)="voidBill(b)" data-void-confirm>
                          {{ busy() ? 'Voiding…' : 'Void bill' }}
                        </button>
                        <button type="button" class="btn" (click)="voiding.set(null)">Keep</button>
                      </div>
                    </div>
                  } @else {
                    <div class="flex gap-2 pt-1">
                      <button type="button" class="btn" [disabled]="printing() === b.bill_no" (click)="print(b.bill_no)" data-print>
                        {{ printing() === b.bill_no ? 'Preparing…' : 'Print' }}
                      </button>
                      @if (isAdmin() && b.status === 'paid') {
                        <button type="button" class="btn text-red-300" (click)="startVoid(b.bill_no)" data-void>Void</button>
                      }
                    </div>
                  }
                </div>
              }
            </li>
          } @empty {
            <li class="text-slate-400">No bills on this date.</li>
          }
        </ul>
      }
    </section>
  `,
})
export class Bills implements OnInit, OnDestroy {
  private readonly sb = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);
  private readonly receipts = inject(ReceiptService);
  private readonly auth = inject(AuthService);

  protected readonly today = todayIst();
  protected readonly day = signal(todayIst());
  protected readonly bills = signal<BillRow[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly open = signal<number | null>(null);
  protected readonly voiding = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly printing = signal<number | null>(null);
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');

  protected readonly money = inr;
  private timer?: ReturnType<typeof setInterval>;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.load();
  };

  ngOnInit(): void {
    void this.load();
    this.timer = setInterval(() => void this.load(), 60_000);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  protected when(iso: string): string {
    return formatIst(iso);
  }

  protected label(mode: string): string {
    return MODE_LABEL[mode] ?? mode;
  }

  protected modes(b: BillRow): string {
    return b.payments.length ? [...new Set(b.payments.map((p) => this.label(p.mode)))].join(' + ') : 'No payment';
  }

  protected sortedItems(b: BillRow): BillRow['bill_items'] {
    return [...b.bill_items].sort((x, y) => x.id - y.id);
  }

  protected setDay(value: string): void {
    if (!value) return;
    this.day.set(value);
    this.open.set(null);
    void this.load();
  }

  protected toggle(no: number): void {
    this.open.set(this.open() === no ? null : no);
    this.voiding.set(null);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { from, to } = istDayRange(this.day());
    const { data, error } = await this.sb
      .from('bills')
      .select(
        'bill_no, created_at, customer_name, subtotal, discount, total, status, void_reason, ' +
          'bill_items(id, kind, name, qty, unit_price, amount), payments(id, mode, amount, reference)',
      )
      .gte('created_at', from)
      .lt('created_at', to)
      .order('bill_no', { ascending: false });
    this.loading.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.error.set(null);
    this.bills.set(
      ((data ?? []) as unknown as BillRow[]).map((b) => ({
        ...b,
        subtotal: Number(b.subtotal),
        discount: Number(b.discount),
        total: Number(b.total),
        bill_items: b.bill_items.map((i) => ({ ...i, unit_price: Number(i.unit_price), amount: Number(i.amount) })),
        payments: b.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      })),
    );
    this.loaded.set(true);
  }

  protected async print(no: number): Promise<void> {
    this.printing.set(no);
    const err = await this.receipts.printBill(no);
    this.printing.set(null);
    if (err) this.toast.error(err);
  }

  protected startVoid(no: number): void {
    this.reason.set('');
    this.voiding.set(no);
  }

  protected async voidBill(b: BillRow): Promise<void> {
    this.busy.set(true);
    const { error } = await this.sb.rpc('void_bill', { p_bill_no: b.bill_no, p_reason: this.reason().trim() });
    this.busy.set(false);
    if (error) {
      this.toast.error(friendlyError(error));
      return;
    }
    this.voiding.set(null);
    this.toast.success(`Bill #${b.bill_no} voided, stock restored`);
    await this.load();
  }
}
