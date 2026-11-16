import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { formatDuration, playedMs, sessionCharge } from '../core/pricing';
import { ServerClock } from '../core/server-clock';
import { SupabaseService } from '../core/supabase.service';
import { alarmKey, alarmLimitMs, AlarmSnapshot, alarmRemainingMs, dueAlarms, overText, playAlarmSound } from '../core/time-up';
import { friendlyError } from './errors';
import { Icon } from './icon';
import { ToastService } from './toast.service';

interface Row extends AlarmSnapshot {
  station_id: number;
  customer_name: string | null;
  package_name: string | null;
  stations: { name: string } | null;
}

const COLUMNS =
  'id, station_id, status, customer_name, package_name, rate_per_hour, block_min, min_bill_min, package_minutes, package_price, ' +
  'pass_id, pass_minutes_left, started_at, paused_at, paused_seconds, ended_at, alarm_minutes, alarm_extra_minutes, stations(name)';
const STORE_KEY = 'time-up-dismissed';

/**
 * The "time is up" pop-up. Mounted once for signed-in staff and admins, so it shows on any screen.
 * It watches the open sessions (live), rings a short beep every few seconds while something is overdue, and
 * offers Extend, Stop timer or Dismiss. It never changes billing: Extend only moves the alarm.
 */
@Component({
  selector: 'app-time-up',
  imports: [Icon],
  template: `
    @if (rows().length > 0) {
      <div class="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="timeup-title" data-timeup>
        <div class="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-fuchsia-400/60 bg-slate-900 p-4 shadow-[0_0_60px_-10px_rgb(217_70_239_/_0.8)]">
          <div class="flex items-center gap-3">
            <span class="grid size-11 shrink-0 animate-pulse-glow place-items-center rounded-full bg-linear-to-br from-violet-600 to-fuchsia-500 text-white"><app-icon name="clock" [size]="24" /></span>
            <div class="min-w-0">
              <h2 id="timeup-title" class="font-display text-2xl font-bold">Time is up</h2>
              <p class="text-sm text-slate-400">{{ rows().length === 1 ? 'This session has reached its time.' : rows().length + ' sessions have reached their time.' }}</p>
            </div>
          </div>

          <ul class="mt-4 space-y-3">
            @for (r of rows(); track r.key) {
              <li class="rounded-xl border border-violet-500/40 bg-slate-950/60 p-3" [attr.data-timeup-station]="r.name">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-display text-xl font-bold">{{ r.name }}</p>
                    <p class="truncate text-xs text-slate-400">{{ r.what }}@if (r.customer) { · {{ r.customer }} }</p>
                  </div>
                  <span class="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold text-fuchsia-200" data-over>{{ r.over }}</span>
                </div>
                <p class="mt-2 flex items-baseline justify-between text-sm text-slate-300">
                  <span>Played <span class="font-mono text-base text-slate-100">{{ r.played }}</span></span>
                  <span>So far <span class="font-semibold text-emerald-300">₹{{ r.charge.toFixed(2) }}</span></span>
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" class="btn-primary !py-1.5" [disabled]="busy() === r.id" (click)="extend(r.id, 15)" data-extend-15>+15 min</button>
                  <button type="button" class="btn-outline !py-1.5" [disabled]="busy() === r.id" (click)="extend(r.id, 30)" data-extend-30>+30 min</button>
                  <button type="button" class="btn !py-1.5" [disabled]="busy() === r.id" (click)="stop(r.id, r.key)" data-stop>Stop timer</button>
                  <button type="button" class="btn !py-1.5 text-slate-400" (click)="dismiss(r.key)" data-dismiss>Dismiss</button>
                </div>
              </li>
            }
          </ul>

          <div class="mt-4 flex gap-2">
            <button type="button" class="btn-outline flex-1" (click)="openStations()" data-open-stations>Open stations</button>
            @if (rows().length > 1) { <button type="button" class="btn" (click)="dismissAll()" data-dismiss-all>Dismiss all</button> }
          </div>
          <p class="mt-3 text-xs text-slate-500">Extend only moves this reminder. Billing follows the normal rules: package overtime is charged in billing blocks.</p>
        </div>
      </div>
    }
  `,
})
export class TimeUpAlerts implements OnInit, OnDestroy {
  private readonly sb = inject(SupabaseService).client;
  private readonly clock = inject(ServerClock);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly sessions = signal<Row[]>([]);
  private readonly dismissed = signal<ReadonlySet<string>>(this.loadDismissed());
  protected readonly busy = signal<number | null>(null);

  private readonly due = computed(() => dueAlarms(this.sessions(), this.clock.now(), this.dismissed()));
  /** Changes only when a different set of alerts is showing, so the beep does not repeat every second. */
  private readonly dueKeys = computed(() => this.due().map(alarmKey).join('|'));

  protected readonly rows = computed(() => {
    const now = this.clock.now();
    return this.due().map((s) => ({
      id: s.id,
      key: alarmKey(s),
      name: s.stations?.name ?? 'Station',
      customer: s.customer_name,
      what: s.package_name ? `${s.package_name} package` : `${(alarmLimitMs(s) ?? 0) / 60_000} min timer`,
      over: overText(alarmRemainingMs(s, now) ?? 0),
      played: formatDuration(playedMs(s, now)),
      charge: sessionCharge(s, now),
    }));
  });

  private channel?: RealtimeChannel;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;

  constructor() {
    effect((onCleanup) => {
      if (this.dueKeys() === '') return;
      playAlarmSound();
      const t = setInterval(playAlarmSound, 8000);
      onCleanup(() => clearInterval(t));
    });
  }

  ngOnInit(): void {
    void this.clock.sync();
    void this.load();
    this.channel = this.sb
      .channel('time-up-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => void this.load(), 150);
      })
      .subscribe();
    this.refreshTimer = setInterval(() => void this.load(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.channel) void this.sb.removeChannel(this.channel);
    clearInterval(this.refreshTimer);
    clearTimeout(this.debounce);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.sb.from('sessions').select(COLUMNS).in('status', ['running', 'paused']);
    if (error) return; // a missed refresh is harmless: the next one runs within a minute
    this.sessions.set((data ?? []) as unknown as Row[]);
  }

  private loadDismissed(): ReadonlySet<string> {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  }

  private remember(keys: Set<string>): void {
    this.dismissed.set(keys);
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify([...keys].slice(-200)));
    } catch {
      /* storage not available: dismissals last until the page is reloaded */
    }
  }

  protected dismiss(key: string): void {
    this.remember(new Set([...this.dismissed(), key]));
  }

  protected dismissAll(): void {
    this.remember(new Set([...this.dismissed(), ...this.rows().map((r) => r.key)]));
  }

  protected async extend(id: number, minutes: number): Promise<void> {
    this.busy.set(id);
    const { error } = await this.sb.rpc('extend_session_alarm', { p_session: id, p_minutes: minutes });
    this.busy.set(null);
    if (error) return this.toast.error(friendlyError(error));
    this.toast.success(`Reminder moved ${minutes} min later`);
    await this.load();
  }

  protected async stop(id: number, key: string): Promise<void> {
    this.busy.set(id);
    const { error } = await this.sb.rpc('end_session', { p_session: id });
    this.busy.set(null);
    if (error) return this.toast.error(friendlyError(error));
    this.dismiss(key);
    this.toast.success('Timer stopped. Open Stations to bill it.');
    await this.load();
  }

  protected openStations(): void {
    void this.router.navigateByUrl('/counter/stations');
  }
}
