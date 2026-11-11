import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { formatIst, inr } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { ToastService } from '../../shared/toast.service';
import { notBlank, phone } from '../../shared/validators';
import { minutesLeft, minutesText, passState } from '../passes/pass-utils';
import {
  bookingStatusLabel,
  bookParams,
  CustomerDetail,
  CustomerRow,
  isRepeatNoShow,
  lastBookedText,
  noShowRate,
  passParams,
} from './customer-utils';

/** Find a customer and see everything about them in one place. Staff and admin. */
@Component({
  selector: 'app-customers',
  imports: [ReactiveFormsModule, FieldError, RouterLink, Icon],
  template: `
    <section class="space-y-4 p-4">
      <div>
        <h1 class="page-title">Customers</h1>
        <p class="text-sm text-slate-400">Look a customer up by name, phone number or login email.</p>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <!-- list -->
        <div class="space-y-3" [class]="detail() ? 'hidden lg:block' : ''" data-list-pane>
          <label class="label">Search
            <input class="field" placeholder="e.g. Asha or 98765" [value]="search()" (input)="onSearch($any($event.target).value)" data-search />
          </label>
          @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
          <ul class="space-y-2" data-customers>
            @for (c of rows(); track c.id) {
              <li>
                <button type="button" class="card w-full text-left hover:border-violet-400/60" [class]="selectedId() === c.id ? '!border-orange-500/70' : ''"
                        (click)="open(c.id)" [attr.data-customer]="c.name">
                  <span class="flex items-start justify-between gap-2">
                    <span class="min-w-0">
                      <span class="block truncate font-medium">{{ c.name }}</span>
                      <span class="block truncate text-sm text-slate-400">{{ c.phone || 'No phone' }}{{ c.email ? ' · ' + c.email : '' }}</span>
                      <span class="block text-xs text-slate-500">{{ lastBooked(c) }}</span>
                    </span>
                    <span class="flex shrink-0 flex-wrap justify-end gap-1">
                      @if (c.has_login) { <span class="badge bg-cyan-400/15 text-cyan-300" data-badge-login>Online login</span> }
                      @if (c.active_passes > 0) { <span class="badge bg-violet-500/25 text-violet-200" data-badge-pass>Pass</span> }
                      @if (warn(c.no_shows)) { <span class="badge bg-amber-500/20 text-amber-300" data-badge-noshow>{{ c.no_shows }} no-shows</span> }
                    </span>
                  </span>
                </button>
              </li>
            } @empty {
              <li class="text-sm text-slate-400" data-none>{{ loading() ? 'Loading…' : 'No customers match.' }}</li>
            }
          </ul>
          @if (rows().length === 200) { <p class="text-xs text-slate-500">Showing the first 200. Search to narrow it down.</p> }
        </div>

        <!-- detail -->
        <div [class]="detail() ? '' : 'hidden lg:block'" data-detail-pane>
          @if (detail(); as d) {
            <div class="space-y-4">
              <button type="button" class="btn lg:hidden" (click)="close()" data-back>← All customers</button>

              <div class="card space-y-3" data-card>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h2 class="truncate font-display text-2xl font-bold" data-name>{{ d.customer.name }}</h2>
                    <p class="text-sm text-slate-300">{{ d.customer.phone || 'No phone' }}{{ d.customer.email ? ' · ' + d.customer.email : '' }}</p>
                    <p class="text-xs text-slate-500">Customer since {{ date(d.customer.created_at) }}</p>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    @if (d.customer.has_login) { <span class="badge bg-cyan-400/15 text-cyan-300">Online login</span> }
                    @if (warn(d.counts.no_shows)) { <span class="badge bg-amber-500/20 text-amber-300" data-warning>Often a no-show ({{ noShowPct(d) }})</span> }
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-center sm:grid-cols-5" data-counts>
                  <div class="rounded-lg bg-slate-800/60 p-2"><p class="font-display text-xl font-bold">{{ d.counts.bookings }}</p><p class="text-xs text-slate-400">Bookings</p></div>
                  <div class="rounded-lg bg-slate-800/60 p-2"><p class="font-display text-xl font-bold">{{ d.counts.attended }}</p><p class="text-xs text-slate-400">Attended</p></div>
                  <div class="rounded-lg bg-slate-800/60 p-2"><p class="font-display text-xl font-bold" data-noshows>{{ d.counts.no_shows }}</p><p class="text-xs text-slate-400">No-shows</p></div>
                  <div class="rounded-lg bg-slate-800/60 p-2"><p class="font-display text-xl font-bold">{{ d.counts.cancelled }}</p><p class="text-xs text-slate-400">Cancelled</p></div>
                  <div class="col-span-2 rounded-lg bg-orange-500/10 p-2 sm:col-span-1"><p class="font-display text-xl font-bold text-orange-400" data-spent>{{ inr(d.spent) }}</p><p class="text-xs text-slate-400">Spent</p></div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <a routerLink="/counter/bookings" [queryParams]="bookQ()" class="btn-primary inline-flex items-center gap-2" data-book-for><app-icon name="calendar" [size]="16" /> Book for this customer</a>
                  <a routerLink="/counter/passes" [queryParams]="passQ()" class="btn-outline inline-flex items-center gap-2" data-sell-pass><app-icon name="tag" [size]="16" /> Sell a pass</a>
                </div>
              </div>

              <form [formGroup]="form" (ngSubmit)="save()" class="card space-y-3" data-edit>
                <h3 class="text-lg font-bold">Details and note</h3>
                @if (d.customer.has_login) {
                  <p class="text-xs text-slate-400" data-login-note>This customer signed in online and manages their own name and phone. You can add a note.</p>
                }
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="label">Name
                    <input formControlName="name" class="field" data-edit-name />
                    <app-field-error [control]="form.controls.name" />
                  </label>
                  <label class="label">Phone
                    <input formControlName="phone" inputmode="tel" class="field" data-edit-phone />
                    <app-field-error [control]="form.controls.phone" />
                  </label>
                </div>
                <label class="label">Staff note (only staff see this)
                  <textarea formControlName="notes" rows="3" class="field" data-edit-notes></textarea>
                </label>
                @if (saveError()) { <p class="text-sm text-red-400" role="alert" data-save-error>{{ saveError() }}</p> }
                <button type="submit" class="btn-primary" [disabled]="busy()" data-save>{{ busy() ? 'Saving…' : 'Save' }}</button>
              </form>

              <div class="card space-y-2" data-passes>
                <h3 class="text-lg font-bold">Passes</h3>
                @for (p of d.passes; track p.id) {
                  <div class="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <p class="font-medium">{{ p.name }}</p>
                      <p class="text-xs text-slate-400">
                        {{ left(p) === null ? 'Unlimited' : minutes(left(p)!) + ' left' }} · until {{ date(p.expires_at) }}
                      </p>
                    </div>
                    <span class="badge" [class]="state(p) === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'">{{ state(p) }}</span>
                  </div>
                } @empty { <p class="text-sm text-slate-400">No passes.</p> }
              </div>

              <div class="card space-y-2" data-bookings>
                <h3 class="text-lg font-bold">Bookings</h3>
                @for (b of d.bookings; track b.id) {
                  <div class="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <p class="font-medium">{{ b.station_type.toUpperCase() }} · {{ date(b.start_at) }}</p>
                      <p class="text-xs text-slate-400">{{ b.channel }}</p>
                    </div>
                    <span class="badge" [class]="statusStyle(b.status)">{{ statusLabel(b.status) }}</span>
                  </div>
                } @empty { <p class="text-sm text-slate-400">No bookings.</p> }
              </div>

              <div class="card space-y-2" data-bills>
                <h3 class="text-lg font-bold">Bills</h3>
                @for (b of d.bills; track b.bill_no) {
                  <div class="flex items-center justify-between gap-2 text-sm">
                    <p>Bill {{ b.bill_no }} <span class="text-xs text-slate-400">· {{ b.kind === 'pass' ? 'pass' : 'booking' }} · {{ date(b.created_at) }}</span></p>
                    <p [class]="b.status === 'void' ? 'text-slate-500 line-through' : 'font-medium'">{{ inr(b.total) }}{{ b.status === 'void' ? ' (void)' : '' }}</p>
                  </div>
                } @empty { <p class="text-sm text-slate-400">No bills linked to this customer.</p> }
              </div>
            </div>
          } @else {
            <p class="card text-sm text-slate-400">Choose a customer to see their bookings, passes and bills.</p>
          }
        </div>
      </div>
    </section>
  `,
})
export class Customers implements OnInit, OnDestroy {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<CustomerRow[]>([]);
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly detail = signal<CustomerDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly saveError = signal<string | null>(null);
  private readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setTimeout>;
  private seq = 0;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    phone: ['', [phone]],
    notes: [''],
  });

  protected readonly bookQ = computed(() => (this.detail() ? bookParams(this.detail()!.customer) : {}));
  protected readonly passQ = computed(() => (this.detail() ? passParams(this.detail()!.customer) : {}));

  protected inr = inr;
  protected date = (iso: string): string => formatIst(iso);
  protected warn = isRepeatNoShow;
  protected minutes = minutesText;
  protected statusLabel = bookingStatusLabel;
  protected noShowPct = (d: CustomerDetail): string => noShowRate({ no_shows: d.counts.no_shows, bookings: d.counts.bookings });
  protected lastBooked = (c: CustomerRow): string => lastBookedText(c.last_booking, formatIst);
  protected left = (p: CustomerDetail['passes'][number]): number | null => minutesLeft(p);
  protected state = (p: CustomerDetail['passes'][number]): string => passState(p, this.now());
  protected statusStyle = (s: string): string =>
    s === 'no_show' ? 'bg-amber-500/20 text-amber-300' : s === 'cancelled' ? 'bg-slate-600/40 text-slate-300'
      : s === 'confirmed' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-emerald-500/20 text-emerald-300';

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  /** Search as you type, a short pause after the last key. */
  protected onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  private async load(): Promise<void> {
    const my = ++this.seq;
    this.loading.set(true);
    const { data, error } = await this.sb.rpc('customer_list', { p_search: this.search().trim() || null });
    if (my !== this.seq) return;
    this.loading.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.error.set(null);
    this.rows.set((data ?? []) as CustomerRow[]);
  }

  protected async open(id: number): Promise<void> {
    this.selectedId.set(id);
    this.saveError.set(null);
    const { data, error } = await this.sb.rpc('customer_detail', { p_customer: id });
    if (error) {
      this.toast.error(friendlyError(error));
      return;
    }
    const d = data as CustomerDetail;
    this.now.set(Date.now());
    this.detail.set(d);
    this.form.reset({ name: d.customer.name, phone: d.customer.phone ?? '', notes: d.customer.notes ?? '' });
    // a customer who signed in online owns their name and phone
    if (d.customer.has_login) {
      this.form.controls.name.disable();
      this.form.controls.phone.disable();
    } else {
      this.form.controls.name.enable();
      this.form.controls.phone.enable();
    }
  }

  protected close(): void {
    this.detail.set(null);
    this.selectedId.set(null);
  }

  protected async save(): Promise<void> {
    const d = this.detail();
    if (!d || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.saveError.set(null);
    const { error } = await this.sb.rpc('update_customer', {
      p_id: d.customer.id,
      p_name: v.name.trim(),
      p_phone: v.phone.trim() || null,
      p_notes: v.notes.trim() || null,
    });
    this.busy.set(false);
    if (error) {
      this.saveError.set(friendlyError(error));
      return;
    }
    this.toast.success('Saved');
    await Promise.all([this.open(d.customer.id), this.load()]);
  }
}
