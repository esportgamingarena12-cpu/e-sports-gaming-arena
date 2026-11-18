import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { chargeEndMs, formatDuration, packageRemainingMs, playedMs, sessionCharge } from '../../core/pricing';
import { ServerClock } from '../../core/server-clock';
import { ToastService } from '../../shared/toast.service';
import { CounterStore, OpenSession, Station, TabLine } from '../counter.store';
import { formatIstTime } from '../../shared/format';
import { alarmRemainingMs } from '../../core/time-up';
import { relativeStart, upcomingBooking } from '../booking-utils';
import { BillSource, CheckoutDialog } from '../checkout/checkout-dialog';
import { EndTimeDialog } from './end-time-dialog';
import { ExtendDialog } from './extend-dialog';
import { OvertimeControl } from './overtime-control';
import { StartDialog } from './start-dialog';

interface Card {
  station: Station;
  /** a confirmed booking within the next hour (or already due) on this station */
  booking: { text: string } | null;
  session: OpenSession | null;
  played: string;
  charge: number;
  packageLeft: { text: string; over: boolean } | null;
  /** the timer chosen for an hourly session (time left, or how far past it) */
  timer: { text: string; over: boolean } | null;
  items: TabLine[];
  canteen: number;
}

@Component({
  selector: 'app-counter-stations',
  imports: [StartDialog, ExtendDialog, EndTimeDialog, CheckoutDialog, OvertimeControl, RouterLink],
  providers: [CounterStore],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Stations</h1>
        <span class="text-xs" [class]="store.live() ? 'text-emerald-400' : 'text-amber-400'">
          {{ store.live() ? '● Live' : '● Connecting…' }}
        </span>
      </div>

      @if (store.error(); as e) { <p class="mt-3 rounded bg-red-500/15 p-2 text-sm text-red-300" role="alert">{{ e }}</p> }

      @if (!store.loaded()) {
        <p class="mt-4 text-slate-400">Loading…</p>
      } @else if (cards().length === 0) {
        <p class="mt-4 text-slate-400">No active stations. Add them under Admin → Stations.</p>
      } @else {
        <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (c of cards(); track c.station.id; let i = $index) {
            @if (i === 0 && activeCount() > 0) {
              <li class="col-span-full text-xs font-semibold uppercase tracking-wide text-emerald-300" data-group="in-use">In use · {{ activeCount() }}</li>
            }
            @if (i === activeCount() && activeCount() < cards().length) {
              <li class="col-span-full mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400" data-group="available">Available · {{ cards().length - activeCount() }}</li>
            }
            <li class="card space-y-2" [class]="borderFor(c)" [attr.data-station]="c.station.name">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-lg font-semibold">{{ c.station.name }}</p>
                  <p class="text-xs text-slate-400">{{ c.station.type }} · ₹{{ c.station.rate_per_hour }}/hr</p>
                </div>
                <span class="shrink-0 rounded px-2 py-0.5 text-xs font-medium" [class]="badgeFor(c)">{{ labelFor(c) }}</span>
              </div>

              @if (c.booking; as b) {
                <p class="rounded bg-sky-500/15 px-2 py-1 text-xs text-sky-300" data-booking-note>{{ b.text }}</p>
              }

              @if (c.session; as s) {
                <div class="flex items-end justify-between gap-2">
                  <p class="font-mono text-2xl" data-timer>{{ c.played }}</p>
                  <p class="text-xl font-semibold text-emerald-300" data-charge>₹{{ c.charge.toFixed(2) }}</p>
                </div>
                <!-- the details, as label / value rows -->
                <dl class="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 rounded-lg bg-slate-950/40 px-3 py-2 text-sm" data-info>
                  <dt class="text-slate-400">Customer</dt>
                  <dd class="min-w-0 truncate font-medium text-slate-100">{{ s.customer_name || 'Walk-in' }}@if (s.customer_phone) { <span class="font-normal text-slate-400"> · {{ s.customer_phone }}</span> }</dd>

                  @if (s.pass_name) {
                    <dt class="text-slate-400">Pass</dt>
                    <dd class="min-w-0 truncate" data-pass-note>{{ s.pass_name }} · {{ s.pass_minutes_left === null ? 'unlimited' : s.pass_minutes_left + ' min left' }}</dd>
                  } @else if (s.package_minutes !== null) {
                    <dt class="text-slate-400">Package</dt>
                    <dd class="min-w-0 truncate">{{ s.package_name }} · {{ s.package_minutes }} min · ₹{{ s.package_price }}</dd>
                    @if (c.packageLeft; as p) {
                      <dt class="text-slate-400">{{ p.over ? 'Overtime' : 'Time left' }}</dt>
                      <dd [class]="p.over ? 'font-semibold text-red-400' : 'text-slate-200'" data-package-left>{{ p.text }}</dd>
                    }
                  } @else {
                    <dt class="text-slate-400">Billing</dt>
                    <dd>Per hour</dd>
                  }
                  @if (c.timer; as t) {
                    <dt class="text-slate-400">Timer</dt>
                    <dd data-timer-note [class]="t.over ? 'font-semibold text-fuchsia-300' : 'text-slate-200'">{{ t.over ? 'over by ' : '' }}{{ t.text }}{{ t.over ? '' : ' left' }}</dd>
                  }
                  @if (c.items.length) {
                    <dt class="text-slate-400">Tab</dt>
                    <dd class="min-w-0 truncate"><span class="font-medium">₹{{ c.canteen.toFixed(2) }}</span> · {{ itemsText(c.items) }}</dd>
                  }
                </dl>

                <app-overtime-control [session]="s" (changed)="store.load()" />

                @if (confirmCancel() === s.id) {
                  <div class="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm">
                    <p>Cancel this session without a bill?</p>
                    <div class="mt-2 flex gap-2">
                      <button type="button" class="btn-primary !bg-red-500" [disabled]="busy() === s.id" (click)="cancelSession(s)">Yes, cancel</button>
                      <button type="button" class="btn" (click)="confirmCancel.set(null)">Keep</button>
                    </div>
                  </div>
                } @else {
                  <!-- buttons: Bill on its own wide row, the rest in a tidy grid -->
                  <div class="space-y-2 pt-1">
                    <button type="button" class="btn-primary w-full !py-2.5" [disabled]="busy() === s.id" (click)="bill(c)">Bill</button>
                    <div class="grid grid-cols-2 gap-2">
                      <button type="button" class="btn-outline" [disabled]="busy() === s.id" (click)="extendFor.set({ station: c.station, session: s })" data-extend>Extend</button>
                      @if (s.status !== 'ended') {
                        <button type="button" class="btn" [disabled]="busy() === s.id" (click)="act(s, 'end_session')">Stop</button>
                      } @else {
                        <button type="button" class="btn !border-violet-400/60 !text-violet-200" [disabled]="busy() === s.id" (click)="undoStop(s)" data-undo-stop title="Stopped by mistake: carry on, and the time since the Stop counts as played">Undo stop</button>
                      }
                      <a class="btn text-center" routerLink="/counter/canteen" [queryParams]="{ tab: s.id }">+ Items</a>
                      <button type="button" class="btn" [disabled]="busy() === s.id" (click)="endFor.set({ station: c.station, session: s })" data-left-earlier title="The customer left and nobody pressed Stop">Left earlier?</button>
                      @if (isAdmin()) {
                        <button type="button" class="btn col-span-2 text-red-300" (click)="confirmCancel.set(s.id)">Cancel session</button>
                      }
                    </div>
                  </div>
                }
              } @else {
                <button type="button" class="btn-primary w-full" (click)="startFor.set(c.station)">Start</button>
              }
            </li>
          }
        </ul>
      }

      @if (startFor(); as st) {
        <app-start-dialog [station]="st" [packages]="store.packages()" [warning]="warningFor(st)"
                          (started)="store.load()" (closed)="startFor.set(null)" />
      }

      @if (endFor(); as en) {
        <app-end-time-dialog [session]="en.session" [stationName]="en.station.name" (saved)="store.load()" (closed)="endFor.set(null)" />
      }

      @if (extendFor(); as ex) {
        <app-extend-dialog [station]="ex.station" [session]="ex.session" [packages]="store.packages()"
                           (done)="store.load()" (closed)="extendFor.set(null)" />
      }

      @if (billFor(); as src) {
        <app-checkout-dialog [source]="src" (billed)="store.load()" (done)="closeBill()" (closed)="closeBill()" />
      }
    </section>
  `,
})
export class CounterStations implements OnInit, OnDestroy {
  protected readonly store = inject(CounterStore);
  private readonly clock = inject(ServerClock);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');

  protected readonly startFor = signal<Station | null>(null);
  protected readonly extendFor = signal<{ station: Station; session: OpenSession } | null>(null);
  protected readonly endFor = signal<{ station: Station; session: OpenSession } | null>(null);
  protected readonly billFor = signal<BillSource | null>(null);
  protected readonly busy = signal<number | null>(null);
  protected readonly confirmCancel = signal<number | null>(null);

  /** One view per active station; recalculated every second by the shared clock. */
  protected readonly cards = computed<Card[]>(() => {
    const now = this.clock.now();
    const bySession = new Map<number, TabLine[]>();
    for (const t of this.store.tabs()) bySession.set(t.session_id, [...(bySession.get(t.session_id) ?? []), t]);
    const byStation = this.store.sessionByStation();

    const all = this.store.stations().map((station) => {
      const session = byStation.get(station.id) ?? null;
      const next = upcomingBooking(this.store.bookings(), station.id, now);
      const booking = next
        ? { text: `Booked ${formatIstTime(next.start_at)} · ${next.customer_name} (${relativeStart(next.start_at, now)})` }
        : null;
      if (!session) {
        return { station, booking, session: null, played: '', charge: 0, packageLeft: null, timer: null, items: [], canteen: 0 };
      }
      const end = chargeEndMs(session, now);
      const left = packageRemainingMs(session, end);
      const items = bySession.get(session.id) ?? [];
      const timerLeft = session.package_minutes === null && session.status !== 'ended' ? alarmRemainingMs(session, now) : null;
      return {
        station,
        booking,
        session,
        played: formatDuration(playedMs(session, end)),
        charge: sessionCharge(session, end),
        packageLeft: left === null ? null : { text: formatDuration(left), over: left < 0 },
        timer: timerLeft === null ? null : { text: formatDuration(timerLeft), over: timerLeft <= 0 },
        items,
        canteen: items.reduce((sum, i) => sum + i.price * i.qty, 0),
      };
    });
    // stations with a session (running, or stopped and not billed) first, the unused ones after; each group keeps its set order
    return [...all.filter((c) => c.session !== null), ...all.filter((c) => c.session === null)];
  });

  /** how many stations have a session right now (they are listed first) */
  protected readonly activeCount = computed(() => this.cards().filter((c) => c.session !== null).length);

  ngOnInit(): void {
    this.store.start();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  protected labelFor(c: Card): string {
    switch (c.session?.status) {
      case 'running':
        return 'Running';
      case 'paused':
        return 'Paused';
      case 'ended':
        return 'Ended – not billed';
      default:
        return 'Available';
    }
  }

  protected badgeFor(c: Card): string {
    switch (c.session?.status) {
      case 'running':
        return 'bg-emerald-500/20 text-emerald-300';
      case 'paused':
        return 'bg-amber-500/20 text-amber-300';
      case 'ended':
        return 'bg-orange-500/20 text-orange-300';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  }

  protected borderFor(c: Card): string {
    switch (c.session?.status) {
      case 'running':
        return '!border-emerald-500/60';
      case 'paused':
        return '!border-amber-500/60';
      case 'ended':
        return '!border-orange-500/60';
      default:
        return '';
    }
  }

  protected itemsText(items: TabLine[]): string {
    return items.map((i) => `${i.qty}× ${i.name}`).join(', ');
  }

  protected async act(s: OpenSession, fn: string): Promise<void> {
    this.busy.set(s.id);
    const err = await this.store.call(fn, { p_session: s.id });
    this.busy.set(null);
    if (err) this.toast.error(err);
  }

  /** A Stop pressed by mistake: the session carries on as if it had never been stopped. */
  protected async undoStop(s: OpenSession): Promise<void> {
    this.busy.set(s.id);
    const err = await this.store.call('undo_stop_session', { p_session: s.id });
    this.busy.set(null);
    if (err) this.toast.error(err);
    else this.toast.success('Resumed: the time since the Stop counts as played');
  }

  protected async cancelSession(s: OpenSession): Promise<void> {
    this.busy.set(s.id);
    const err = await this.store.call('cancel_session', { p_session: s.id });
    this.busy.set(null);
    this.confirmCancel.set(null);
    if (err) this.toast.error(err);
    else this.toast.success('Session cancelled');
  }

  /** Bill: freeze the timer (end_session), then open the checkout with the server's charge. */
  protected async bill(c: Card): Promise<void> {
    const s = c.session;
    if (!s) return;
    this.busy.set(s.id);
    const { data, error } = await this.store.callData('end_session', { p_session: s.id });
    this.busy.set(null);
    if (error) {
      this.toast.error(error);
      return;
    }
    // the session is now ended, so its played time and tab are frozen
    const ended = this.store.sessions().find((x) => x.id === s.id) ?? s;
    const items = this.store.tabs().filter((t) => t.session_id === s.id);
    this.billFor.set({
      kind: 'station',
      sessionId: s.id,
      title: c.station.name,
      gamingLabel: `Gaming – ${c.station.name} (${s.pass_name ? s.pass_name + ' pass' : s.package_name ? 'package “' + s.package_name + '”' : 'per hour'})`,
      gaming: Number(data),
      played: formatDuration(playedMs(ended, chargeEndMs(ended, this.clock.now()))),
      customerName: s.customer_name,
      items: items.map((t) => ({ productId: t.product_id, name: t.name, qty: t.qty, price: t.price })),
    });
  }

  /** Walk-in conflict (FR-37): a booking on this station within the next hour. */
  protected warningFor(station: Station): string | null {
    const now = this.clock.now();
    const b = upcomingBooking(this.store.bookings(), station.id, now);
    if (!b) return null;
    const when = Date.parse(b.start_at) <= now ? 'was due at' : 'is booked at';
    return `${b.customer_name} ${when} ${formatIstTime(b.start_at)} (${relativeStart(b.start_at, now)}). Starting a walk-in now may run into this booking.`;
  }

  protected closeBill(): void {
    this.billFor.set(null);
    void this.store.load();
  }
}
