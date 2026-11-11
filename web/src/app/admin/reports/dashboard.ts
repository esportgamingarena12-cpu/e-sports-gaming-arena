import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { formatIst, formatIstTime, inr } from '../../shared/format';
import { Icon } from '../../shared/icon';
import {
  barHeight,
  DashboardData,
  DashStation,
  donutParts,
  durationText,
  HourRow,
  hourLabel,
  linePoints,
  LiveSession,
  niceMax,
  playedMinutes,
  stationState,
  TrendRow,
} from './report-utils';
import { ReportsService } from './reports.service';
import { SalesSummaryView } from './sales-summary';

const CHART_W = 300;
const CHART_H = 100;
const BAR_H = 70;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, SalesSummaryView, Icon],
  template: `
    <section class="space-y-4 p-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 class="page-title">Welcome back, {{ firstName() }}!</h1>
          <p class="text-sm text-slate-400">Here is what is happening at your arena today.</p>
        </div>
        <span class="badge border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200">{{ todayLabel }}</span>
      </div>
      @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

      <!-- Headline tiles -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tiles>
        <div class="rounded-xl border border-violet-500/40 bg-linear-to-br from-violet-600/30 to-slate-900 p-3">
          <div class="flex items-center gap-2 text-violet-300"><app-icon name="monitor" /><span class="text-xs">Total stations</span></div>
          <p class="mt-1 font-display text-3xl font-bold" data-tile-total>{{ activeStations().length }}</p>
        </div>
        <div class="rounded-xl border border-cyan-400/40 bg-linear-to-br from-cyan-400/20 to-slate-900 p-3">
          <div class="flex items-center gap-2 text-cyan-300"><app-icon name="gamepad" /><span class="text-xs">Active sessions</span></div>
          <p class="mt-1 font-display text-3xl font-bold" data-tile-busy>{{ busyCount() }}</p>
        </div>
        <div class="rounded-xl border border-emerald-500/40 bg-linear-to-br from-emerald-500/20 to-slate-900 p-3">
          <div class="flex items-center gap-2 text-emerald-300"><app-icon name="check" /><span class="text-xs">Available now</span></div>
          <p class="mt-1 font-display text-3xl font-bold" data-tile-free>{{ freeCount() }}</p>
        </div>
        <div class="rounded-xl border border-orange-500/40 bg-linear-to-br from-orange-500/25 to-slate-900 p-3">
          <div class="flex items-center gap-2 text-orange-400"><app-icon name="rupee" /><span class="text-xs">Today's sales</span></div>
          <p class="mt-1 font-display text-3xl font-bold" data-tile-sales>{{ data() ? inr(data()!.sales.net_sales) : '…' }}</p>
        </div>
      </div>

      <!-- Stations quick view + session summary -->
      <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div class="card" data-station-grid>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold">Stations <span class="text-sm font-normal text-slate-400">(quick view)</span></h2>
            <a routerLink="/counter/stations" class="text-sm text-cyan-300 hover:underline">Open counter →</a>
          </div>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
            <span><span class="dot bg-emerald-500"></span> Available ({{ freeCount() }})</span>
            <span><span class="dot bg-red-500"></span> Occupied ({{ busyCount() }})</span>
            <span><span class="dot bg-orange-500"></span> Switched off ({{ offCount() }})</span>
          </div>
          <div class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            @for (s of stations(); track s.id) {
              <div class="rounded-lg border px-1 py-2 text-center"
                   [class]="state(s) === 'free' ? 'border-emerald-500/60 bg-emerald-500/10' : state(s) === 'busy' ? 'border-red-500/60 bg-red-500/10' : 'border-orange-500/60 bg-orange-500/10'"
                   [attr.data-state]="state(s)">
                <span [class]="state(s) === 'free' ? 'text-emerald-400' : state(s) === 'busy' ? 'text-red-400' : 'text-orange-400'"><app-icon [name]="s.type === 'pc' ? 'monitor' : 'gamepad'" [size]="18" /></span>
                <p class="text-xs font-semibold leading-tight">{{ s.name }}</p>
                <p class="text-[10px] text-slate-400">{{ state(s) === 'free' ? 'Free' : state(s) === 'busy' ? 'In use' : 'Off' }}</p>
              </div>
            } @empty { <p class="col-span-full text-sm text-slate-400">No stations yet.</p> }
          </div>
        </div>

        <div class="card" data-occupancy>
          <h2 class="text-lg font-bold">Session summary</h2>
          <div class="mt-2 flex items-center gap-4">
            <svg viewBox="0 0 42 42" class="size-32 shrink-0 -rotate-90" role="img" aria-label="Stations by state">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="#25233b" stroke-width="6" />
              @for (seg of donut(); track seg.color) {
                <circle cx="21" cy="21" r="15.915" fill="none" [attr.stroke]="seg.color" stroke-width="6"
                        [attr.stroke-dasharray]="seg.len + ' ' + (100 - seg.len)" [attr.stroke-dashoffset]="-seg.start" />
              }
              <text x="21" y="21" transform="rotate(90 21 21)" text-anchor="middle" dominant-baseline="central" fill="#f8fafc" font-size="9" font-weight="700">{{ activeStations().length }}</text>
            </svg>
            <ul class="space-y-1 text-sm">
              <li><span class="dot bg-red-500"></span> Occupied <b>{{ busyCount() }}</b></li>
              <li><span class="dot bg-emerald-500"></span> Available <b>{{ freeCount() }}</b></li>
              <li><span class="dot bg-orange-500"></span> Off <b>{{ offCount() }}</b></li>
            </ul>
          </div>
          @for (o of data()?.occupancy ?? []; track o.type) {
            <div class="mt-3">
              <div class="flex justify-between text-xs text-slate-300"><span>{{ o.type.toUpperCase() }}</span><span>{{ o.in_use }} of {{ o.total }} in use</span></div>
              <div class="mt-1 h-2 rounded bg-slate-800"><div class="h-2 rounded bg-violet-500" [style.width.%]="o.total ? (100 * o.in_use) / o.total : 0"></div></div>
            </div>
          }
        </div>
      </div>

      <!-- Today's sales -->
      <div>
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Today's sales</h2>
        <app-sales-summary [s]="data()?.sales ?? null" />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Live sessions -->
        <div class="card" data-live>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold">Live sessions</h2>
            <a routerLink="/counter/stations" class="text-sm text-cyan-300 hover:underline">View all →</a>
          </div>
          <div class="mt-2 divide-y divide-slate-800">
            @for (s of live(); track s.id) {
              <div class="flex items-center justify-between gap-2 py-2 text-sm">
                <div class="min-w-0">
                  <p class="truncate font-medium"><span class="mr-2 rounded bg-violet-600/40 px-1.5 py-0.5 text-xs">{{ stationName(s.station_id) }}</span>{{ s.customer_name || 'Walk-in' }}</p>
                  <p class="text-xs text-slate-400">Started {{ time(s.started_at) }}{{ s.status === 'paused' ? ' · paused' : '' }}</p>
                </div>
                <span class="shrink-0 text-slate-200">{{ duration(s) }}</span>
              </div>
            } @empty { <p class="py-2 text-sm text-slate-400">No session running right now.</p> }
          </div>
        </div>

        <!-- Quick actions -->
        <div class="space-y-4">
          <div class="card">
            <h2 class="text-lg font-bold">Quick actions</h2>
            <p class="mt-1 text-sm text-slate-300" data-active-passes>
              <a routerLink="/counter/passes" class="text-cyan-300 hover:underline">{{ data()?.active_passes ?? 0 }} active pass{{ (data()?.active_passes ?? 0) === 1 ? '' : 'es' }}</a>
            </p>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <a routerLink="/counter/bookings" class="btn flex items-center justify-center gap-2"><app-icon name="calendar" [size]="18" /> New booking</a>
              <a routerLink="/counter/stations" class="btn flex items-center justify-center gap-2"><app-icon name="play" [size]="18" /> Start session</a>
              <a routerLink="/counter/canteen" class="btn flex items-center justify-center gap-2"><app-icon name="cup" [size]="18" /> Canteen sale</a>
              <a routerLink="/admin/reports" class="btn flex items-center justify-center gap-2" data-reports-link><app-icon name="chart" [size]="18" /> Reports</a>
            </div>
          </div>
          <div class="card" data-bookings>
            <h2 class="text-lg font-bold">Today's bookings</h2>
            @if (data(); as d) {
              <dl class="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div><dd class="font-display text-2xl font-bold" data-upcoming>{{ d.bookings.upcoming }}</dd><dt class="text-slate-400">Upcoming</dt></div>
                <div><dd class="font-display text-2xl font-bold">{{ d.bookings.checked_in }}</dd><dt class="text-slate-400">Checked in</dt></div>
                <div><dd class="font-display text-2xl font-bold" data-noshow>{{ d.bookings.no_show }}</dd><dt class="text-slate-400">No-shows</dt></div>
                <div><dd class="font-display text-2xl font-bold">{{ d.bookings.cancelled }}</dd><dt class="text-slate-400">Cancelled</dt></div>
              </dl>
            }
          </div>
        </div>
      </div>

      <div class="card space-y-1" data-low-stock>
        <h2 class="text-lg font-bold">Low stock</h2>
        @for (p of data()?.low_stock ?? []; track p.name) {
          <div class="flex justify-between text-sm"><span>{{ p.name }}</span>
            <span class="text-amber-300">{{ p.stock_qty }} left (alert at {{ p.low_stock_level }})</span></div>
        } @empty { <p class="text-sm text-slate-400">Nothing is running low.</p> }
      </div>

      <div class="card space-y-2" data-trend>
        <h2 class="text-lg font-bold">Revenue overview <span class="text-sm font-normal text-slate-400">(last 30 days)</span></h2>
        @if (trend().length) {
          <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="w-full" role="img"
               aria-label="Daily sales and occupancy for the last 30 days" preserveAspectRatio="none" style="height: 9rem">
            <line x1="0" [attr.y1]="h" [attr.x2]="w" [attr.y2]="h" stroke="currentColor" class="text-slate-700" />
            <polyline fill="none" stroke="#8b5cf6" stroke-width="2" vector-effect="non-scaling-stroke" [attr.points]="salesLine()" />
            <polyline fill="none" stroke="#00d9ff" stroke-width="1.5" vector-effect="non-scaling-stroke" [attr.points]="occLine()" />
          </svg>
          <div class="flex justify-between text-xs text-slate-500"><span>{{ trend()[0].day }}</span><span>{{ trend()[trend().length - 1].day }}</span></div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span class="text-violet-400">━ Sales (top of chart = {{ inr(salesMax()) }})</span>
            <span class="text-cyan-300">━ Occupancy (top = 100%)</span>
          </div>
          <p class="text-xs text-slate-300" data-trend-total>
            30-day sales {{ inr(trendTotal()) }} · average occupancy {{ avgOcc() }}%
          </p>
        } @else { <p class="text-sm text-slate-400">Loading…</p> }
      </div>

      <div class="card space-y-2" data-busy>
        <h2 class="text-lg font-bold">Busiest hours <span class="text-sm font-normal text-slate-400">(sessions started, last 30 days)</span></h2>
        @if (hours().length) {
          <svg [attr.viewBox]="'0 0 240 ' + (barH + 12)" class="mx-auto w-full max-w-2xl" style="max-height: 11rem" role="img" aria-label="Sessions started by hour of day">
            @for (b of hours(); track b.hour) {
              <rect [attr.x]="b.hour * 10 + 1" [attr.y]="barH - bar(b)" width="8" [attr.height]="bar(b)" fill="#ff6b35" rx="1">
                <title>{{ hourLabel(b.hour) }}: {{ b.session_count }} sessions</title>
              </rect>
            }
            @for (t of [0, 6, 12, 18]; track t) {
              <text [attr.x]="t === 0 ? 9 : t * 10 + 5" [attr.y]="barH + 10" font-size="7" text-anchor="middle" fill="currentColor" class="text-slate-500">{{ hourLabel(t) }}</text>
            }
          </svg>
          <p class="text-xs text-slate-300" data-busiest>{{ busiestText() }}</p>
        }
      </div>

      @if (updated()) { <p class="text-xs text-slate-500">Updated {{ updated() }}. Refreshes every 30 seconds.</p> }
    </section>
  `,
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly svc = inject(ReportsService);
  private readonly auth = inject(AuthService);

  protected readonly w = CHART_W;
  protected readonly h = CHART_H;
  protected readonly barH = BAR_H;
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly trend = signal<TrendRow[]>([]);
  protected readonly hours = signal<HourRow[]>([]);
  protected readonly stations = signal<DashStation[]>([]);
  protected readonly live = signal<LiveSession[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly updated = signal<string | null>(null);
  private readonly now = signal(Date.now());

  protected readonly todayLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  protected readonly firstName = computed(() => {
    const p = this.auth.profile();
    return (p?.full_name || p?.email?.split('@')[0] || 'Admin').split(' ')[0];
  });

  private readonly busyIds = computed(() => new Set(this.live().map((s) => s.station_id)));
  protected readonly activeStations = computed(() => this.stations().filter((s) => s.active));
  protected readonly busyCount = computed(() => this.activeStations().filter((s) => this.busyIds().has(s.id)).length);
  protected readonly freeCount = computed(() => this.activeStations().length - this.busyCount());
  protected readonly offCount = computed(() => this.stations().length - this.activeStations().length);
  protected readonly donut = computed(() => {
    const [free, busy, off] = donutParts(this.freeCount(), this.busyCount(), this.offCount());
    return [
      { color: '#ef4444', len: busy, start: 0 },
      { color: '#22c55e', len: free, start: busy },
      { color: '#ff6b35', len: off, start: busy + free },
    ].filter((s) => s.len > 0);
  });

  protected readonly salesMax = computed(() => niceMax(Math.max(0, ...this.trend().map((r) => r.sales))));
  protected readonly salesLine = computed(() =>
    linePoints(this.trend().map((r) => r.sales), CHART_W, CHART_H, this.salesMax()),
  );
  protected readonly occLine = computed(() => linePoints(this.trend().map((r) => r.occupancy), CHART_W, CHART_H, 100));
  protected readonly trendTotal = computed(() => this.trend().reduce((a, r) => a + r.sales, 0));
  protected readonly avgOcc = computed(() => {
    const t = this.trend();
    return t.length ? (t.reduce((a, r) => a + r.occupancy, 0) / t.length).toFixed(1) : '0.0';
  });
  private readonly hourMax = computed(() => Math.max(0, ...this.hours().map((r) => r.session_count)));
  protected readonly busiestText = computed(() => {
    const top = [...this.hours()].filter((r) => r.session_count > 0).sort((a, b) => b.session_count - a.session_count)[0];
    return top ? `Busiest: ${hourLabel(top.hour)} (${top.session_count} sessions)` : 'No sessions yet.';
  });

  protected inr = inr;
  protected hourLabel = hourLabel;
  protected time = formatIstTime;
  protected bar(b: HourRow): number {
    return barHeight(b.session_count, this.hourMax(), BAR_H);
  }
  protected state(s: DashStation) {
    return stationState(s, this.busyIds());
  }
  protected stationName(id: number): string {
    return this.stations().find((s) => s.id === id)?.name ?? '';
  }
  protected duration(s: LiveSession): string {
    return durationText(playedMinutes(s, this.now()));
  }

  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    void this.load();
    this.timer = setInterval(() => void this.load(), 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async load(): Promise<void> {
    try {
      const [d, t, h, st, lv] = await Promise.all([
        this.svc.dashboard(),
        this.svc.trend(30),
        this.svc.busyHours(30),
        this.svc.stations(),
        this.svc.liveSessions(),
      ]);
      this.data.set(d);
      this.trend.set(t);
      this.hours.set(h);
      this.stations.set(st);
      this.live.set(lv);
      this.now.set(Date.now());
      this.error.set(null);
      this.updated.set(formatIst(new Date().toISOString()));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
