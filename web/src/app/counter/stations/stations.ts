import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { chargeEndMs, formatDuration, packageRemainingMs, playedMs, sessionCharge } from '../../core/pricing';
import { ServerClock } from '../../core/server-clock';
import { ToastService } from '../../shared/toast.service';
import { CounterStore, OpenSession, Station, TabLine } from '../counter.store';
import { StartDialog } from './start-dialog';

interface Card {
  station: Station;
  session: OpenSession | null;
  played: string;
  charge: number;
  packageLeft: { text: string; over: boolean } | null;
  items: TabLine[];
  canteen: number;
}

@Component({
  selector: 'app-counter-stations',
  imports: [StartDialog, RouterLink],
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
          @for (c of cards(); track c.station.id) {
            <li class="card space-y-2" [class]="borderFor(c)" [attr.data-station]="c.station.name">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-lg font-semibold">{{ c.station.name }}</p>
                  <p class="text-xs text-slate-400">{{ c.station.type }} · ₹{{ c.station.rate_per_hour }}/hr</p>
                </div>
                <span class="shrink-0 rounded px-2 py-0.5 text-xs font-medium" [class]="badgeFor(c)">{{ labelFor(c) }}</span>
              </div>

              @if (c.session; as s) {
                <div class="flex items-end justify-between gap-2">
                  <p class="font-mono text-2xl" data-timer>{{ c.played }}</p>
                  <p class="text-xl font-semibold text-emerald-300" data-charge>₹{{ c.charge.toFixed(2) }}</p>
                </div>
                @if (s.package_name) {
                  <p class="text-sm">
                    {{ s.package_name }}:
                    @if (c.packageLeft; as p) {
                      <span [class]="p.over ? 'font-semibold text-red-400' : 'text-slate-300'" data-package-left>
                        {{ p.over ? 'overtime ' : '' }}{{ p.text }}{{ p.over ? '' : ' left' }}
                      </span>
                    }
                  </p>
                }
                @if (s.customer_name || s.customer_phone) {
                  <p class="truncate text-sm text-slate-400">{{ s.customer_name }} {{ s.customer_phone }}</p>
                }
                @if (c.items.length) {
                  <p class="text-sm text-slate-300">
                    Tab: {{ itemsText(c.items) }} · <span class="font-medium">₹{{ c.canteen.toFixed(2) }}</span>
                  </p>
                }

                @if (confirmCancel() === s.id) {
                  <div class="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm">
                    <p>Cancel this session without a bill?</p>
                    <div class="mt-2 flex gap-2">
                      <button type="button" class="btn-primary !bg-red-500" [disabled]="busy() === s.id" (click)="cancelSession(s)">Yes, cancel</button>
                      <button type="button" class="btn" (click)="confirmCancel.set(null)">Keep</button>
                    </div>
                  </div>
                } @else {
                  <div class="flex flex-wrap gap-2 pt-1">
                    @if (s.status === 'running') {
                      <button type="button" class="btn" [disabled]="busy() === s.id" (click)="act(s, 'pause_session')">Pause</button>
                      <button type="button" class="btn" [disabled]="busy() === s.id" (click)="act(s, 'end_session')">Stop</button>
                    } @else if (s.status === 'paused') {
                      <button type="button" class="btn-primary !py-1" [disabled]="busy() === s.id" (click)="act(s, 'resume_session')">Resume</button>
                      <button type="button" class="btn" [disabled]="busy() === s.id" (click)="act(s, 'end_session')">Stop</button>
                    } @else {
                      <button type="button" class="btn-primary !py-1" [disabled]="busy() === s.id" (click)="act(s, 'reopen_session')">Resume</button>
                    }
                    <a class="btn" routerLink="/counter/canteen" [queryParams]="{ tab: s.id }">+ Items</a>
                    <button type="button" class="btn" (click)="soon('Billing')">Bill</button>
                    @if (isAdmin()) {
                      <button type="button" class="btn text-red-300" (click)="confirmCancel.set(s.id)">Cancel</button>
                    }
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
        <app-start-dialog [station]="st" [packages]="store.packages()" (started)="store.load()" (closed)="startFor.set(null)" />
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
  protected readonly busy = signal<number | null>(null);
  protected readonly confirmCancel = signal<number | null>(null);

  /** One view per active station; recalculated every second by the shared clock. */
  protected readonly cards = computed<Card[]>(() => {
    const now = this.clock.now();
    const bySession = new Map<number, TabLine[]>();
    for (const t of this.store.tabs()) bySession.set(t.session_id, [...(bySession.get(t.session_id) ?? []), t]);
    const byStation = this.store.sessionByStation();

    return this.store.stations().map((station) => {
      const session = byStation.get(station.id) ?? null;
      if (!session) {
        return { station, session: null, played: '', charge: 0, packageLeft: null, items: [], canteen: 0 };
      }
      const end = chargeEndMs(session, now);
      const left = packageRemainingMs(session, end);
      const items = bySession.get(session.id) ?? [];
      return {
        station,
        session,
        played: formatDuration(playedMs(session, end)),
        charge: sessionCharge(session, end),
        packageLeft: left === null ? null : { text: formatDuration(left), over: left < 0 },
        items,
        canteen: items.reduce((sum, i) => sum + i.price * i.qty, 0),
      };
    });
  });

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

  protected async cancelSession(s: OpenSession): Promise<void> {
    this.busy.set(s.id);
    const err = await this.store.call('cancel_session', { p_session: s.id });
    this.busy.set(null);
    this.confirmCancel.set(null);
    if (err) this.toast.error(err);
    else this.toast.success('Session cancelled');
  }

  protected soon(what: string): void {
    this.toast.success(`${what} arrives in a later phase`);
  }
}
