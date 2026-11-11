import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PassType } from '../../admin/passes/pass-types';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { formatIst, inr } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';
import { notBlank, phone } from '../../shared/validators';
import { checkPayments, daysLeft, minutesLeft, minutesText, passState, PassLike, paymentLines } from './pass-utils';

interface SoldPass extends PassLike {
  id: number;
  name: string;
  station_type: string | null;
  price: number;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
}

const STATE_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300',
  expired: 'bg-slate-600/40 text-slate-300',
  'used up': 'bg-amber-500/20 text-amber-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

/** Sell prepaid passes at the counter and see the passes that were sold. */
@Component({
  selector: 'app-counter-passes',
  imports: [ReactiveFormsModule, FieldError, RouterLink],
  template: `
    <section class="space-y-4 p-4">
      <div>
        <h1 class="page-title">Passes</h1>
        <p class="text-sm text-slate-400">Sell a prepaid pass. To use one, press Start on a station and look the customer up by phone.</p>
      </div>

      @if (types().length === 0) {
        <p class="card text-sm text-slate-300" data-no-types>
          No passes are for sale yet.
          @if (auth.role() === 'admin') { <a routerLink="/admin/passes" class="text-cyan-300 underline">Set up passes</a> }
          @else { Ask the owner to set them up. }
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="sell()" class="card max-w-xl space-y-3" data-sell>
          <h2 class="text-lg font-bold">Sell a pass</h2>
          <label class="label">Pass
            <select formControlName="type" class="field" data-type>
              @for (t of types(); track t.id) { <option [value]="'' + t.id">{{ t.name }} · {{ inr(t.price) }}</option> }
            </select>
          </label>
          @if (selected(); as t) {
            <p class="text-xs text-slate-400" data-terms>
              {{ t.validity_days }} day{{ t.validity_days === 1 ? '' : 's' }} ·
              {{ t.station_type ? t.station_type.toUpperCase() + ' only' : 'all games' }} ·
              {{ t.kind === 'unlimited' ? 'unlimited play' : minutesText(t.minutes_total ?? 0) + ' of play' }}
            </p>
          }
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="label">Customer name
              <input formControlName="name" autocomplete="off" class="field" data-name />
              <app-field-error [control]="form.controls.name" />
            </label>
            <label class="label">Phone
              <input formControlName="phone" inputmode="tel" autocomplete="off" class="field" data-phone />
              <app-field-error [control]="form.controls.phone" />
            </label>
          </div>
          <details class="text-sm">
            <summary class="cursor-pointer text-slate-300">Customer signs in online? Add their login email</summary>
            <label class="label mt-2">Login email (optional)
              <input formControlName="email" type="email" autocomplete="off" class="field" data-email />
            </label>
            <p class="mt-1 text-xs text-slate-400">The pass then shows under My bookings when they sign in.</p>
          </details>

          <fieldset class="space-y-2">
            <legend class="label">Payment</legend>
            <div class="grid grid-cols-3 gap-2">
              <label class="label">Cash<input formControlName="cash" type="number" inputmode="decimal" step="0.01" min="0" class="field" data-cash /></label>
              <label class="label">UPI<input formControlName="upi" type="number" inputmode="decimal" step="0.01" min="0" class="field" data-upi /></label>
              <label class="label">Card<input formControlName="card" type="number" inputmode="decimal" step="0.01" min="0" class="field" data-card /></label>
            </div>
            @if (check(); as c) {
              <p class="text-sm" [class]="c.state === 'match' ? 'text-emerald-300' : 'text-amber-300'" data-status>
                {{ c.state === 'match' ? 'Payment matches the price' : c.state === 'short' ? 'Short by ' + inr(c.diff) : 'Over by ' + inr(c.diff) }}
              </p>
            }
          </fieldset>

          @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
          @if (soldNote()) { <p class="text-sm text-emerald-300" role="status" data-sold>{{ soldNote() }}</p> }
          <button type="submit" class="btn-primary w-full" [disabled]="busy() || check()?.state !== 'match'" data-sell-btn>
            {{ busy() ? 'Selling…' : 'Sell pass' }}
          </button>
        </form>
      }

      <div>
        <h2 class="text-lg font-bold">Sold passes</h2>
        <ul class="mt-2 space-y-2" data-list>
          @for (p of passes(); track p.id) {
            <li class="card space-y-1" [attr.data-sold-pass]="p.id">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-medium">{{ p.name }} <span class="text-sm font-normal text-slate-400">· {{ p.customers?.name }} {{ p.customers?.phone }}</span></p>
                  <p class="text-xs text-slate-400">
                    {{ inr(p.price) }} · sold {{ date(p.created_at) }} · {{ p.station_type ? p.station_type.toUpperCase() : 'all games' }}
                  </p>
                </div>
                <span class="badge shrink-0" [class]="style(state(p))" data-state>{{ state(p) }}</span>
              </div>
              @if (state(p) === 'active') {
                <p class="text-sm">
                  {{ left(p) === null ? 'Unlimited play' : minutesText(left(p)!) + ' left' }} ·
                  until {{ date(p.expires_at) }} ({{ days(p) }} day{{ days(p) === 1 ? '' : 's' }})
                </p>
              }
              @if (auth.role() === 'admin' && p.status === 'active') {
                @if (cancelling() === p.id) {
                  <div class="flex gap-2 pt-1">
                    <input class="field !mt-0" placeholder="Reason" [value]="reason()" (input)="reason.set($any($event.target).value)" data-reason />
                    <button type="button" class="btn-danger shrink-0" [disabled]="busy()" (click)="cancel(p)" data-cancel-yes>Cancel pass</button>
                    <button type="button" class="btn shrink-0" (click)="cancelling.set(null)">Keep</button>
                  </div>
                } @else {
                  <button type="button" class="text-sm text-red-300 underline" (click)="startCancel(p)" data-cancel>Cancel this pass</button>
                }
              }
            </li>
          } @empty {
            <li class="text-sm text-slate-400">No passes sold yet.</li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class CounterPasses implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly types = signal<PassType[]>([]);
  protected readonly passes = signal<SoldPass[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly soldNote = signal<string | null>(null);
  protected readonly cancelling = signal<number | null>(null);
  protected readonly reason = signal('');
  private readonly now = signal(Date.now());

  protected readonly form = this.fb.nonNullable.group({
    type: [''],
    name: ['', [Validators.required, notBlank]],
    phone: ['', [Validators.required, phone]],
    email: ['', [Validators.email]],
    cash: [0],
    upi: [0],
    card: [0],
  });

  private readonly typeId = signal('');
  private readonly cash = signal<number | string>(0);
  private readonly upi = signal<number | string>(0);
  private readonly card = signal<number | string>(0);

  protected readonly selected = computed(() => this.types().find((t) => '' + t.id === this.typeId()) ?? null);
  protected readonly check = computed(() => {
    const t = this.selected();
    return t ? checkPayments(t.price, this.cash(), this.upi(), this.card()) : null;
  });

  protected inr = inr;
  protected minutesText = minutesText;
  protected date = (iso: string): string => formatIst(iso);
  protected state = (p: SoldPass): string => passState(p, this.now());
  protected style = (s: string): string => STATE_STYLE[s] ?? '';
  protected left = (p: SoldPass): number | null => minutesLeft(p);
  protected days = (p: SoldPass): number => daysLeft(p.expires_at, this.now());

  constructor() {
    this.form.controls.type.valueChanges.subscribe((v) => {
      this.typeId.set(v);
      this.fillCash(); // a new pass starts as "all cash"
    });
    this.form.controls.cash.valueChanges.subscribe((v) => this.cash.set(v));
    this.form.controls.upi.valueChanges.subscribe((v) => this.upi.set(v));
    this.form.controls.card.valueChanges.subscribe((v) => this.card.set(v));
  }

  ngOnInit(): void {
    void this.load();
  }

  private fillCash(): void {
    const t = this.types().find((x) => '' + x.id === this.typeId());
    this.form.patchValue({ cash: t ? Number(t.price) : 0, upi: 0, card: 0 });
  }

  private async load(): Promise<void> {
    const [t, p] = await Promise.all([
      this.sb
        .from('pass_types')
        .select('id, name, price, validity_days, station_type, kind, minutes_total, active')
        .eq('active', true)
        .order('name'),
      this.sb
        .from('customer_passes')
        .select('id, name, kind, station_type, price, minutes_total, minutes_used, starts_at, expires_at, status, created_at, customers(name, phone)')
        .order('created_at', { ascending: false })
        .limit(60),
    ]);
    if (t.error) return this.toast.error(friendlyError(t.error));
    this.types.set((t.data ?? []) as PassType[]);
    this.passes.set((p.data ?? []) as unknown as SoldPass[]);
    this.now.set(Date.now());
    if (!this.typeId() && this.types().length) this.form.controls.type.setValue('' + this.types()[0].id);
  }

  protected async sell(): Promise<void> {
    if (this.form.invalid || this.check()?.state !== 'match') {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.soldNote.set(null);
    const { data, error } = await this.sb.rpc('sell_pass', {
      p_pass_type: Number(v.type),
      p_name: v.name.trim(),
      p_phone: v.phone.trim(),
      p_email: v.email.trim() || null,
      p_payments: paymentLines(v.cash, v.upi, v.card),
    });
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    const bill = (data as { bill_no: number }).bill_no;
    this.soldNote.set(`Pass sold. Bill ${bill} is in Bills.`);
    this.form.patchValue({ name: '', phone: '', email: '' });
    this.form.markAsUntouched();
    this.fillCash();
    await this.load();
  }

  protected startCancel(p: SoldPass): void {
    this.reason.set('');
    this.cancelling.set(p.id);
  }

  protected async cancel(p: SoldPass): Promise<void> {
    if (!this.reason().trim()) {
      this.toast.error('Enter a reason');
      return;
    }
    this.busy.set(true);
    const { error } = await this.sb.rpc('cancel_pass', { p_pass: p.id, p_reason: this.reason().trim() });
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    this.toast.success('Pass cancelled');
    this.cancelling.set(null);
    await this.load();
  }
}
