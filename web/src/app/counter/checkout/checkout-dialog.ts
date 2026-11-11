import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { twoDecimals } from '../../shared/validators';
import { ReceiptService } from '../receipt/receipt.service';
import { buildUpiLink, cashChange, discountError, formatPaise, paidPaise, paymentStatus, toPaise } from './payments';
import { qrSvgDataUrl } from './qr';

export interface BillLine {
  productId: number;
  name: string;
  qty: number;
  price: number;
}

export type BillSource =
  | {
      kind: 'station';
      sessionId: number;
      title: string;
      gamingLabel: string;
      gaming: number;
      played: string;
      customerName: string | null;
      items: BillLine[];
    }
  | { kind: 'walkin'; items: BillLine[] };

type Mode = 'cash' | 'upi' | 'card';

/**
 * One bill for gaming time + canteen items, paid by any mix of Cash / UPI / Card.
 * The server recalculates every amount; this dialog only collects the discount and the payment split.
 */
@Component({
  selector: 'app-checkout-dialog',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" aria-label="Checkout">
      <div class="max-h-full w-full max-w-lg overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">

        @if (billNo(); as no) {
          <!-- saved -->
          <div class="space-y-4 text-center" data-saved>
            <p class="text-3xl">✓</p>
            <h2 class="text-lg font-semibold">Bill #{{ no }} saved</h2>
            <p class="text-2xl font-semibold text-emerald-300">{{ money(totalPaise()) }}</p>
            @if (printError()) { <p class="text-sm text-red-400" role="alert">{{ printError() }}</p> }
            <div class="flex gap-2">
              <button type="button" class="btn-primary flex-1" [disabled]="printing()" (click)="print(no)">
                {{ printing() ? 'Preparing…' : 'Print receipt' }}
              </button>
              <button type="button" class="btn flex-1" (click)="done.emit()">Done</button>
            </div>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="confirm()" class="space-y-4">
            <h2 class="text-lg font-semibold">{{ title() }}</h2>

            <!-- lines -->
            <ul class="divide-y divide-slate-800 text-sm" data-bill-lines>
              @if (gamingLine(); as g) {
                <li class="flex items-start justify-between gap-2 py-1">
                  <span>{{ g.label }}<span class="block text-xs text-slate-400">Played {{ g.played }}</span></span>
                  <span>{{ money(g.paise) }}</span>
                </li>
              }
              @for (l of items(); track l.productId) {
                <li class="flex justify-between gap-2 py-1">
                  <span class="min-w-0 truncate">{{ l.qty }}× {{ l.name }}</span>
                  <span>{{ money(lineTotal(l)) }}</span>
                </li>
              }
            </ul>

            @if (isWalkin()) {
              <label class="label">Customer name (optional)
                <input formControlName="customer" autocomplete="off" class="field" />
              </label>
            }

            <!-- totals -->
            <div class="space-y-1 text-sm">
              <p class="flex justify-between"><span>Subtotal</span><span data-subtotal>{{ money(subtotalPaise()) }}</span></p>
              <label class="label">Discount (₹)
                <input formControlName="discount" type="number" inputmode="decimal" step="0.01" class="field" data-discount />
                <app-field-error [control]="form.controls.discount" />
              </label>
              @if (discountErr(); as e) { <p class="text-xs text-red-400" role="alert">{{ e }}</p> }
              <p class="flex justify-between text-lg font-semibold"><span>Total</span><span data-total>{{ money(totalPaise()) }}</span></p>
            </div>

            <!-- payment -->
            <fieldset class="space-y-3 rounded border border-slate-800 p-3">
              <legend class="px-1 text-sm font-medium">Payment</legend>
              <div class="flex flex-wrap gap-2 text-sm">
                <span class="text-slate-400">Pay all by</span>
                <button type="button" class="btn !py-0.5" (click)="payAll('cash')" data-pay-all-cash>Cash</button>
                <button type="button" class="btn !py-0.5" (click)="payAll('upi')" data-pay-all-upi>UPI</button>
                <button type="button" class="btn !py-0.5" (click)="payAll('card')" data-pay-all-card>Card</button>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <label class="label">Cash
                  <input formControlName="cash" type="number" inputmode="decimal" step="0.01" class="field" data-cash />
                  <app-field-error [control]="form.controls.cash" />
                </label>
                <label class="label">UPI
                  <input formControlName="upi" type="number" inputmode="decimal" step="0.01" class="field" data-upi />
                  <app-field-error [control]="form.controls.upi" />
                </label>
                <label class="label">Card
                  <input formControlName="card" type="number" inputmode="decimal" step="0.01" class="field" data-card />
                  <app-field-error [control]="form.controls.card" />
                </label>
              </div>

              <p class="text-sm font-medium" data-status
                 [class]="status().state === 'match' ? 'text-emerald-300' : 'text-amber-300'">
                @switch (status().state) {
                  @case ('match') { Payment matches total }
                  @case ('short') { Short by {{ money(status().diffPaise) }} }
                  @default { Over by {{ money(status().diffPaise) }} }
                }
              </p>

              @if (cashDue() > 0) {
                <div class="grid grid-cols-2 items-end gap-2">
                  <label class="label">Cash received
                    <input formControlName="cashReceived" type="number" inputmode="decimal" step="0.01" class="field" data-cash-received />
                  </label>
                  <p class="pb-2 text-sm" data-change>
                    @if (change() !== null) { Change to return: <span class="font-semibold text-emerald-300">{{ money(change()!) }}</span> }
                    @else { Change: — }
                  </p>
                </div>
              }

              @if (upiDue() > 0) {
                <div class="space-y-2">
                  @if (upiLink(); as link) {
                    <div class="flex items-center gap-3">
                      <img [src]="qr()" alt="UPI QR code" class="h-40 w-40 rounded bg-white" data-qr />
                      <p class="text-sm">Scan to pay <span class="font-semibold">{{ money(upiDue()) }}</span><br />
                        <span class="text-xs text-slate-400">to {{ payee() }}</span></p>
                    </div>
                    <span class="hidden" data-upi-link>{{ link }}</span>
                    <p class="text-xs text-slate-400">Confirm the credit in the UPI app before saving.</p>
                  } @else {
                    <p class="text-sm text-amber-300" role="alert" data-no-upi-id>
                      No UPI ID set, so no QR code. Admin can add it under Settings. You can still record the UPI amount.
                    </p>
                  }
                  <label class="label">UPI reference (optional)
                    <input formControlName="upiRef" autocomplete="off" class="field" />
                  </label>
                </div>
              }

              @if (cardDue() > 0) {
                <label class="label">Card reference, e.g. last 4 digits (optional)
                  <input formControlName="cardRef" autocomplete="off" class="field" />
                </label>
              }
            </fieldset>

            @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

            <div class="flex gap-2">
              <button type="submit" class="btn-primary flex-1" [disabled]="!canConfirm()" data-confirm>
                {{ busy() ? 'Saving…' : 'Confirm payment' }}
              </button>
              <button type="button" class="btn" [disabled]="busy()" (click)="closed.emit()">Cancel</button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class CheckoutDialog implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly receipts = inject(ReceiptService);

  readonly source = input.required<BillSource>();
  /** Emitted once the bill is saved (the screen behind can refresh / clear the cart). */
  readonly billed = output<number>();
  readonly done = output<void>();
  readonly closed = output<void>();

  protected readonly money = formatPaise;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly billNo = signal<number | null>(null);
  protected readonly printing = signal(false);
  protected readonly printError = signal<string | null>(null);
  private readonly upiId = signal<string | null>(null);
  private readonly payeeName = signal('');

  protected readonly form = this.fb.group({
    customer: this.fb.nonNullable.control(''),
    discount: this.fb.control<number | null>(0, [Validators.min(0), twoDecimals]),
    cash: this.fb.control<number | null>(null, [Validators.min(0), twoDecimals]),
    upi: this.fb.control<number | null>(null, [Validators.min(0), twoDecimals]),
    card: this.fb.control<number | null>(null, [Validators.min(0), twoDecimals]),
    cashReceived: this.fb.control<number | null>(null, [Validators.min(0), twoDecimals]),
    upiRef: this.fb.nonNullable.control(''),
    cardRef: this.fb.nonNullable.control(''),
  });
  private readonly value = signal(this.form.getRawValue());

  protected readonly isWalkin = computed(() => this.source().kind === 'walkin');
  protected readonly title = computed(() => {
    const s = this.source();
    return s.kind === 'station' ? `Bill – ${s.title}` : 'Walk-in sale';
  });
  protected readonly items = computed(() => this.source().items);
  protected readonly gamingLine = computed(() => {
    const s = this.source();
    return s.kind === 'station' ? { label: s.gamingLabel, played: s.played, paise: toPaise(s.gaming) } : null;
  });

  protected lineTotal(l: BillLine): number {
    return toPaise(l.price) * l.qty;
  }

  protected readonly subtotalPaise = computed(
    () => (this.gamingLine()?.paise ?? 0) + this.items().reduce((sum, l) => sum + this.lineTotal(l), 0),
  );
  protected readonly discountPaise = computed(() => toPaise(this.value().discount));
  protected readonly discountErr = computed(() => discountError(this.discountPaise(), this.subtotalPaise()));
  protected readonly totalPaise = computed(
    () => this.subtotalPaise() - (this.discountErr() ? 0 : this.discountPaise()),
  );
  protected readonly status = computed(() => paymentStatus(this.totalPaise(), paidPaise(this.value())));
  protected readonly cashDue = computed(() => toPaise(this.value().cash));
  protected readonly upiDue = computed(() => toPaise(this.value().upi));
  protected readonly cardDue = computed(() => toPaise(this.value().card));
  protected readonly change = computed(() => cashChange(this.cashDue(), toPaise(this.value().cashReceived)));
  protected readonly payee = computed(() => this.payeeName());

  protected readonly upiLink = computed(() => {
    const id = this.upiId();
    return id && this.upiDue() > 0 ? buildUpiLink(id, this.payeeName(), this.upiDue()) : null;
  });
  protected readonly qr = computed(() => {
    const link = this.upiLink();
    return link ? qrSvgDataUrl(link) : '';
  });

  protected readonly canConfirm = computed(
    () => !this.busy() && this.form.valid && !this.discountErr() && this.status().state === 'match',
  );

  constructor() {
    this.form.valueChanges.subscribe(() => this.value.set(this.form.getRawValue()));
  }

  async ngOnInit(): Promise<void> {
    const s = this.source();
    if (s.kind === 'station' && s.customerName) this.form.controls.customer.setValue(s.customerName);
    const { data } = await this.sb.from('settings').select('upi_id, upi_payee_name, shop_name').maybeSingle();
    if (data) {
      this.upiId.set(data.upi_id?.trim() ? data.upi_id.trim() : null);
      this.payeeName.set(data.upi_payee_name?.trim() || data.shop_name || '');
    }
  }

  /** Puts the whole total on one mode and clears the others. */
  protected payAll(mode: Mode): void {
    const rupees = this.totalPaise() / 100;
    this.form.patchValue({
      cash: mode === 'cash' ? rupees : null,
      upi: mode === 'upi' ? rupees : null,
      card: mode === 'card' ? rupees : null,
    });
  }

  protected async confirm(): Promise<void> {
    if (!this.canConfirm()) return;
    const s = this.source();
    const v = this.form.getRawValue();
    const rupees = (paise: number): number => Number((paise / 100).toFixed(2));
    const payments = [
      { mode: 'cash', amount: rupees(toPaise(v.cash)), reference: null },
      { mode: 'upi', amount: rupees(toPaise(v.upi)), reference: v.upiRef.trim() || null },
      { mode: 'card', amount: rupees(toPaise(v.card)), reference: v.cardRef.trim() || null },
    ].filter((p) => p.amount > 0);

    this.busy.set(true);
    this.error.set(null);
    const { data, error } = await this.sb.rpc('checkout_bill', {
      p: {
        session_id: s.kind === 'station' ? s.sessionId : null,
        items: s.kind === 'walkin' ? s.items.map((l) => ({ product_id: l.productId, qty: l.qty })) : [],
        customer_name: v.customer.trim() || null,
        discount: rupees(this.discountErr() ? 0 : this.discountPaise()),
        payments,
      },
    });
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    const no = Number(data);
    this.billNo.set(no);
    this.billed.emit(no);
  }

  protected async print(no: number): Promise<void> {
    this.printing.set(true);
    this.printError.set(null);
    const err = await this.receipts.printBill(no);
    this.printing.set(false);
    if (err) this.printError.set(err);
  }
}
