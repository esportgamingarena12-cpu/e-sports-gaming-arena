import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ServerClock } from '../../core/server-clock';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { formatIstTime, istDayRange, todayIst } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';
import {
  BookingStatus,
  STATUS_LABEL,
  bookingAt,
  canCancel,
  canCheckIn,
  canMarkNoShow,
  istDateOf,
  relativeStart,
  slotStartMs,
  slotStarts,
  weekdayOf,
} from '../booking-utils';
import { CounterStore } from '../counter.store';
import { BookingPrefill, BookingRules, NewBookingDialog } from './new-booking-dialog';

interface BookingRow {
  id: number;
  station_id: number;
  station_type: string;
  start_at: string;
  end_at: string;
  slots: number;
  status: BookingStatus;
  channel: 'online' | 'counter' | 'phone';
  notes: string | null;
  customer_name: string;
  customer_phone: string | null;
}

interface OpeningHour {
  weekday: number;
  open_time: string;
  close_time: string;
  closed: boolean;
}

const BADGE: Record<BookingStatus, string> = {
  confirmed: 'bg-sky-500/20 text-sky-300',
  checked_in: 'bg-emerald-500/20 text-emerald-300',
  completed: 'bg-slate-600/40 text-slate-300',
  cancelled: 'bg-red-500/20 text-red-300',
  no_show: 'bg-amber-500/20 text-amber-300',
};

@Component({
  selector: 'app-counter-bookings',
  imports: [NewBookingDialog, RouterLink],
  providers: [CounterStore],
  template: `
    <section class="p-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <h1 class="text-xl font-semibold">Bookings</h1>
        <span class="text-xs" [class]="store.live() ? 'text-emerald-400' : 'text-amber-400'">
          {{ store.live() ? '● Live' : '● Connecting…' }}
        </span>
      </div>

      <div class="mt-3 flex flex-wrap items-end gap-2">
        <label class="label">Date
          <input type="date" class="field !mt-0 w-auto" [value]="day()" (change)="setDay($any($event.target).value)" data-date />
        </label>
        <label class="label min-w-0 flex-1">Search name or phone
          <input type="search" class="field !mt-0" [value]="search()" (input)="search.set($any($event.target).value)"
                 placeholder="e.g. Raj or 98765" data-search />
        </label>
        <button type="button" class="btn-primary" (click)="openNew({})" data-new>+ New booking</button>
      </div>

      @if (error()) { <p class="mt-3 rounded bg-red-500/15 p-2 text-sm text-red-300" role="alert">{{ error() }}</p> }

      <!-- list -->
      <h2 class="mt-5 text-lg font-semibold">
        {{ searching() ? 'Search results' : isToday() ? 'Today' : day() }}
        <span class="text-sm font-normal text-slate-400">({{ rows().length }})</span>
      </h2>
      @if (!loaded()) {
        <p class="mt-2 text-slate-400">Loading…</p>
      } @else {
        <ul class="mt-2 space-y-2" data-booking-list>
          @for (b of rows(); track b.id) {
            <li class="card space-y-2" [attr.data-booking]="b.id">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-semibold">
                    {{ time(b.start_at) }} – {{ time(b.end_at) }}
                    @if (searching()) { <span class="text-xs font-normal text-slate-400">{{ dayOf(b.start_at) }}</span> }
                  </p>
                  <p class="truncate">{{ b.customer_name }}
                    <span class="text-sm text-slate-400">{{ b.customer_phone }}</span></p>
                  <p class="text-xs text-slate-400">
                    {{ stationName(b.station_id) }} · {{ b.slots * rules().slot_minutes }} min · {{ b.channel }}
                    @if (b.notes) { · {{ b.notes }} }
                  </p>
                </div>
                <span class="shrink-0 rounded px-2 py-0.5 text-xs font-medium" [class]="badge(b.status)" data-status>{{ label(b.status) }}</span>
              </div>

              @if (b.status === 'confirmed') {
                <p class="text-xs text-slate-400">{{ relative(b.start_at) }}</p>
              }

              @if (confirmCancel() === b.id) {
                <div class="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm">
                  <p>Cancel this booking?</p>
                  <div class="mt-2 flex gap-2">
                    <button type="button" class="btn-primary !bg-red-500" [disabled]="busy() === b.id" (click)="cancel(b)" data-cancel-yes>Yes, cancel</button>
                    <button type="button" class="btn" (click)="confirmCancel.set(null)">Keep</button>
                  </div>
                </div>
              } @else {
                <div class="flex flex-wrap gap-2">
                  @if (canCheckIn(b)) {
                    <button type="button" class="btn-primary !py-1" [disabled]="busy() === b.id" (click)="checkIn(b)" data-check-in>Check in</button>
                  }
                  @if (canNoShow(b)) {
                    <button type="button" class="btn" [disabled]="busy() === b.id" (click)="noShow(b)" data-no-show>No-show</button>
                  }
                  @if (canCancelRow(b)) {
                    <button type="button" class="btn text-red-300" (click)="confirmCancel.set(b.id)" data-cancel>Cancel</button>
                  }
                  @if (b.status === 'checked_in') {
                    <a class="btn" routerLink="/counter/stations">Open stations</a>
                  }
                </div>
              }
            </li>
          } @empty {
            <li class="text-slate-400">{{ searching() ? 'No bookings match.' : 'No bookings on this date.' }}</li>
          }
        </ul>
      }

      <!-- grid -->
      <h2 class="mt-6 text-lg font-semibold">Day grid</h2>
      @if (!hours()) {
        <p class="mt-2 text-slate-400">Loading…</p>
      } @else if (hours()!.closed) {
        <p class="mt-2 text-slate-400">Closed on this day.</p>
      } @else {
        <p class="mt-1 text-xs text-slate-400">Tap a free slot to book it. Scroll sideways for later times.</p>
        <div class="mt-2 overflow-x-auto rounded border border-slate-800" data-grid>
          <table class="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th class="sticky left-0 z-10 min-w-20 border-b border-slate-800 bg-slate-950 px-2 py-1 text-left">Station</th>
                @for (m of slotMins(); track m) {
                  <th class="min-w-14 border-b border-slate-800 px-1 py-1 font-normal text-slate-400">{{ shortTime(m) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (st of store.stations(); track st.id) {
                <tr>
                  <th class="sticky left-0 z-10 border-b border-slate-800 bg-slate-950 px-2 py-1 text-left font-medium">{{ st.name }}</th>
                  @for (m of slotMins(); track m) {
                    @let c = cell(st.id, m);
                    <td class="border-b border-slate-800 p-0.5">
                      @switch (c.kind) {
                        @case ('free') {
                          <button type="button" class="h-8 w-full rounded bg-slate-800/60 hover:bg-emerald-500/30"
                                  (click)="openNew({ stationId: st.id, day: day(), startMinutes: m })"
                                  [attr.aria-label]="'Book ' + st.name + ' at ' + shortTime(m)" data-cell-free></button>
                        }
                        @case ('booked') {
                          <div class="flex h-8 items-center justify-center truncate rounded px-1" [class]="c.cls" [title]="c.title" data-cell-booked>{{ c.text }}</div>
                        }
                        @case ('inuse') {
                          <div class="flex h-8 items-center justify-center rounded bg-rose-500/30 px-1 text-rose-200" title="Session running" data-cell-inuse>In use</div>
                        }
                        @default {
                          <div class="h-8 rounded bg-slate-900/40"></div>
                        }
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (dialog(); as d) {
        <app-new-booking-dialog [stations]="store.stations()" [rules]="rules()" [prefill]="d"
                                (created)="onCreated()" (closed)="dialog.set(null)" />
      }
    </section>
  `,
})
export class CounterBookings implements OnInit, OnDestroy {
  protected readonly store = inject(CounterStore);
  private readonly sb = inject(SupabaseService).client;
  private readonly clock = inject(ServerClock);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly day = signal(todayIst());
  protected readonly search = signal('');
  protected readonly dayRows = signal<BookingRow[]>([]);
  protected readonly searchRows = signal<BookingRow[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<number | null>(null);
  protected readonly confirmCancel = signal<number | null>(null);
  protected readonly dialog = signal<BookingPrefill | null>(null);
  protected readonly rules = signal<BookingRules>({ slot_minutes: 30, max_slots: 8, min_slots: 1, window_days: 7 });
  private readonly openingHours = signal<OpeningHour[]>([]);

  protected readonly searching = computed(() => this.search().trim().length >= 2);
  protected readonly isToday = computed(() => this.day() === todayIst());

  /** Rows shown in the list: the day's bookings, or search matches across nearby days. */
  protected readonly rows = computed(() => {
    if (!this.searching()) return this.dayRows();
    const q = this.search().trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return this.searchRows().filter(
      (b) =>
        b.customer_name.toLowerCase().includes(q) ||
        (digits.length >= 2 && (b.customer_phone ?? '').replace(/\D/g, '').includes(digits)),
    );
  });

  protected readonly hours = computed(() => this.openingHours().find((h) => h.weekday === weekdayOf(this.day())) ?? null);
  protected readonly slotMins = computed(() => {
    const h = this.hours();
    return h && !h.closed ? slotStarts(h.open_time.slice(0, 5), h.close_time.slice(0, 5), this.rules().slot_minutes) : [];
  });

  /** The day's active bookings for the grid (cancelled and no-shows leave the slot free). */
  private readonly activeDay = computed(() => this.dayRows().filter((b) => b.status === 'confirmed' || b.status === 'checked_in'));

  constructor() {
    // arriving from the Customers screen: open the booking form for that customer once the stations are loaded
    const q = this.route.snapshot.queryParamMap;
    const who = { name: q.get('name') ?? '', phone: q.get('phone') ?? '' };
    if (who.name || who.phone) {
      const opener = effect(() => {
        if (this.store.stations().length > 0) {
          untracked(() => this.dialog.set(who));
          opener.destroy();
        }
      });
    }
    // reload the lists whenever anything changes anywhere (Realtime) or the date changes
    effect(() => {
      this.store.changes();
      this.day();
      void this.loadDay();
    });
    effect(() => {
      if (this.searching()) {
        this.store.changes();
        void this.loadSearch();
      }
    });
  }

  ngOnInit(): void {
    this.store.start();
    void this.loadSettings();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  // ---- display helpers ----
  protected time(iso: string): string {
    return formatIstTime(iso);
  }
  protected dayOf(iso: string): string {
    return istDateOf(Date.parse(iso));
  }
  protected shortTime(minutes: number): string {
    return formatIstTime(new Date(slotStartMs(this.day(), minutes)).toISOString());
  }
  protected label(s: BookingStatus): string {
    return STATUS_LABEL[s];
  }
  protected badge(s: BookingStatus): string {
    return BADGE[s];
  }
  protected relative(startIso: string): string {
    return relativeStart(startIso, this.clock.now());
  }
  protected stationName(id: number): string {
    return this.store.stationById().get(id)?.name ?? `Station ${id}`;
  }
  protected canCheckIn(b: BookingRow): boolean {
    return canCheckIn(b, this.clock.now());
  }
  protected canNoShow(b: BookingRow): boolean {
    return canMarkNoShow(b, this.clock.now());
  }
  protected canCancelRow(b: BookingRow): boolean {
    return canCancel(b);
  }

  /** What to draw in one grid cell. */
  protected cell(stationId: number, minutes: number): { kind: 'free' | 'booked' | 'inuse' | 'past'; text?: string; cls?: string; title?: string } {
    const slot = this.rules().slot_minutes;
    const start = slotStartMs(this.day(), minutes);
    const now = this.clock.now();
    const b = bookingAt(this.activeDay(), stationId, start, slot);
    if (b) {
      const first = (b.customer_name.trim()[0] ?? '?').toUpperCase();
      return {
        kind: 'booked',
        text: first,
        title: `${b.customer_name} · ${formatIstTime(b.start_at)}–${formatIstTime(b.end_at)}`,
        cls: b.status === 'checked_in' ? 'bg-emerald-500/30 text-emerald-200' : 'bg-sky-500/30 text-sky-200',
      };
    }
    if (start + slot * 60_000 <= now) return { kind: 'past' };
    if (this.isToday() && start <= now && this.store.sessionByStation().has(stationId)) return { kind: 'inuse' };
    return { kind: 'free' };
  }

  // ---- actions ----
  protected setDay(value: string): void {
    if (value) this.day.set(value);
  }

  protected openNew(prefill: BookingPrefill): void {
    this.dialog.set(prefill);
  }

  protected onCreated(): void {
    this.toast.success('Booking created');
    this.store.changes.update((n) => n + 1);
  }

  protected async checkIn(b: BookingRow): Promise<void> {
    this.busy.set(b.id);
    const { error } = await this.sb.rpc('check_in_booking', { p_booking: b.id });
    this.busy.set(null);
    if (error) return this.toast.error(friendlyError(error));
    this.toast.success(`Checked in: timer started on ${this.stationName(b.station_id)}`);
    await this.store.load();
    this.store.changes.update((n) => n + 1);
  }

  protected async noShow(b: BookingRow): Promise<void> {
    this.busy.set(b.id);
    const { error } = await this.sb.rpc('mark_no_show', { p_booking: b.id });
    this.busy.set(null);
    if (error) return this.toast.error(friendlyError(error));
    this.toast.success('Marked as no-show');
    this.store.changes.update((n) => n + 1);
  }

  protected async cancel(b: BookingRow): Promise<void> {
    this.busy.set(b.id);
    const { error } = await this.sb.rpc('cancel_booking', { p_booking: b.id });
    this.busy.set(null);
    this.confirmCancel.set(null);
    if (error) return this.toast.error(friendlyError(error));
    this.toast.success('Booking cancelled');
    this.store.changes.update((n) => n + 1);
  }

  // ---- data ----
  private async loadSettings(): Promise<void> {
    const [bs, oh] = await Promise.all([
      this.sb.from('booking_settings').select('slot_minutes, min_slots, max_slots, window_days').maybeSingle(),
      this.sb.from('opening_hours').select('weekday, open_time, close_time, closed'),
    ]);
    if (bs.data) this.rules.set(bs.data as BookingRules);
    if (oh.data) this.openingHours.set(oh.data as OpeningHour[]);
  }

  private static readonly COLUMNS =
    'id, station_id, station_type, start_at, end_at, slots, status, channel, notes, customers(name, phone)';

  private toRows(data: unknown): BookingRow[] {
    return (
      (data ?? []) as unknown as (Omit<BookingRow, 'customer_name' | 'customer_phone'> & {
        customers: { name: string; phone: string | null } | null;
      })[]
    ).map(({ customers, ...b }) => ({
      ...b,
      customer_name: customers?.name ?? 'Customer',
      customer_phone: customers?.phone ?? null,
    }));
  }

  private async loadDay(): Promise<void> {
    const { from, to } = istDayRange(this.day());
    const { data, error } = await this.sb
      .from('bookings')
      .select(CounterBookings.COLUMNS)
      .gte('start_at', from)
      .lt('start_at', to)
      .order('start_at');
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.error.set(null);
    this.dayRows.set(this.toRows(data));
    this.loaded.set(true);
  }

  /** Search looks a week back and the whole booking window ahead, whatever date is selected. */
  private async loadSearch(): Promise<void> {
    const today = todayIst();
    const from = istDayRange(istDateOf(Date.parse(istDayRange(today).from) - 7 * 86_400_000)).from;
    const to = istDayRange(istDateOf(Date.parse(istDayRange(today).from) + (this.rules().window_days + 1) * 86_400_000)).to;
    const { data, error } = await this.sb
      .from('bookings')
      .select(CounterBookings.COLUMNS)
      .gte('start_at', from)
      .lt('start_at', to)
      .order('start_at');
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.searchRows.set(this.toRows(data));
  }
}
