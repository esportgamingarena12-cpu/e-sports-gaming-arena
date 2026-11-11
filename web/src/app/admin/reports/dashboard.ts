import { AfterViewInit, Component, computed, ElementRef, HostListener, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ControllerArt } from '../../shared/art';
import { formatIst, formatIstTime, inr, todayIst } from '../../shared/format';
import { Icon } from '../../shared/icon';
import {
  avatarInitials,
  barHeight,
  chartPoints,
  DashboardData,
  DashStation,
  donutParts,
  durationText,
  HourRow,
  hourLabel,
  liveAmount,
  LiveSession,
  niceMax,
  pctChange,
  playedMinutes,
  RANGE_LABEL,
  RevenueRange,
  revenueSeries,
  smoothArea,
  smoothPath,
  stationState,
  TrendRow,
  yTicks,
} from './report-utils';
import { ReportsService } from './reports.service';
import { SalesSummaryView } from './sales-summary';

const BAR_H = 70;
/** The revenue chart's drawing height; its width follows the card (see `chartWidth`). */
const PH = 130;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, SalesSummaryView, Icon, ControllerArt],
  template: `
    <section class="space-y-4 p-4 sm:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="page-title animate-rise">Welcome Back, {{ firstName() }}! <span aria-hidden="true">👋</span></h1>
          <p class="text-sm text-slate-400">Here is what is happening at your gaming studio today.</p>
        </div>
        <span class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          <app-icon name="calendar" [size]="16" /> Today, {{ todayLabel }}
        </span>
      </div>
      @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

      <!-- Headline tiles -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tiles>
        <div class="flex items-center gap-3 rounded-xl border border-violet-500/50 bg-linear-to-br from-violet-600/35 to-slate-900 p-3 shadow-[0_0_30px_-14px_rgb(139_92_246_/_0.9)]">
          <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-linear-to-br from-violet-500 to-violet-700 text-white sm:size-14"><app-icon name="monitor" [size]="26" /></span>
          <span><span class="block text-xs text-slate-300">Total Systems</span><span class="font-display text-3xl font-bold" data-tile-total>{{ activeStations().length }}</span></span>
        </div>
        <div class="flex items-center gap-3 rounded-xl border border-cyan-400/50 bg-linear-to-br from-cyan-500/25 to-slate-900 p-3 shadow-[0_0_30px_-14px_rgb(34_211_238_/_0.9)]">
          <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-linear-to-br from-sky-500 to-cyan-400 text-white sm:size-14"><app-icon name="gamepad" [size]="26" /></span>
          <span><span class="block text-xs text-slate-300">Active Sessions</span><span class="font-display text-3xl font-bold" data-tile-busy>{{ busyCount() }}</span></span>
        </div>
        <div class="flex items-center gap-3 rounded-xl border border-emerald-500/50 bg-linear-to-br from-emerald-500/25 to-slate-900 p-3 shadow-[0_0_30px_-14px_rgb(34_197_94_/_0.9)]">
          <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-linear-to-br from-emerald-500 to-green-600 text-white sm:size-14"><app-icon name="check" [size]="26" /></span>
          <span><span class="block text-xs text-slate-300">Available Now</span><span class="font-display text-3xl font-bold" data-tile-free>{{ freeCount() }}</span></span>
        </div>
        <div class="flex items-center gap-3 rounded-xl border border-orange-500/50 bg-linear-to-br from-orange-500/30 to-slate-900 p-3 shadow-[0_0_30px_-14px_rgb(255_107_53_/_0.9)]">
          <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-linear-to-br from-orange-400 to-orange-600 text-white sm:size-14"><app-icon name="rupee" [size]="26" /></span>
          <span><span class="block text-xs text-slate-300">Today's Revenue</span><span class="font-display text-2xl font-bold sm:text-3xl" data-tile-sales>{{ data() ? inr(data()!.sales.net_sales) : '…' }}</span></span>
        </div>
      </div>

      <!-- Gaming systems quick view -->
      <div class="card" data-station-grid>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold">Gaming Systems <span class="text-sm font-normal text-slate-400">(Quick View)</span></h2>
          <a routerLink="/counter/stations" class="text-sm text-cyan-300 hover:underline">View All →</a>
        </div>
        <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
          <span><span class="dot bg-emerald-500"></span> Available ({{ freeCount() }})</span>
          <span><span class="dot bg-violet-500"></span> Occupied ({{ busyCount() }})</span>
          <span><span class="dot bg-orange-500"></span> Switched off ({{ offCount() }})</span>
        </div>
        <div class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          @for (s of stations(); track s.id) {
            <div class="rounded-lg border px-1 py-2 text-center transition hover:-translate-y-0.5"
                 [class]="state(s) === 'free' ? 'border-emerald-500/70 bg-emerald-500/10' : state(s) === 'busy' ? 'border-violet-500/70 bg-violet-500/15' : 'border-orange-500/70 bg-orange-500/10'"
                 [attr.data-state]="state(s)">
              <span [class]="state(s) === 'free' ? 'text-emerald-400' : state(s) === 'busy' ? 'text-violet-300' : 'text-orange-400'"><app-icon [name]="s.type === 'pc' ? 'monitor' : 'gamepad'" [size]="22" /></span>
              <p class="text-xs font-semibold leading-tight">{{ s.name }}</p>
              <p class="text-[10px]" [class]="state(s) === 'free' ? 'text-emerald-400' : state(s) === 'busy' ? 'text-violet-300' : 'text-orange-400'">{{ state(s) === 'free' ? 'Available' : state(s) === 'busy' ? 'Occupied' : 'Switched off' }}</p>
            </div>
          } @empty { <p class="col-span-full text-sm text-slate-400">No stations yet.</p> }
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <!-- Revenue overview -->
        <div class="card" data-trend>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-lg font-bold">Revenue Overview</h2>
            <div class="flex items-center gap-3">
              <a routerLink="/admin/reports" class="text-sm text-cyan-300 hover:underline" data-reports-link>Reports →</a>
              <select class="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs" [value]="range()" (change)="range.set($any($event.target).value)" aria-label="Period" data-range>
                @for (r of ranges; track r) { <option [value]="r" [selected]="r === range()">{{ rangeLabel[r] }}</option> }
              </select>
            </div>
          </div>
          <p class="mt-1 font-display text-3xl font-bold" data-trend-total>{{ inr(series().total) }}
            @if (pct() !== null) {
              <span class="ml-2 text-sm font-semibold" [class]="pct()! >= 0 ? 'text-emerald-400' : 'text-red-400'" data-pct>{{ pct()! >= 0 ? '▲' : '▼' }} {{ pctAbs() }}% <span class="font-normal text-slate-400">{{ vsText() }}</span></span>
            }
          </p>
          <div #chartBox class="mt-2 w-full">
          <svg [attr.viewBox]="'0 0 ' + chartWidth() + ' 176'" [attr.width]="chartWidth()" height="176" class="block max-w-full" role="img" [attr.aria-label]="'Sales, ' + rangeLabel[range()]">
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity="0.5" /><stop offset="1" stop-color="#8b5cf6" stop-opacity="0" /></linearGradient>
              <linearGradient id="rev-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a78bfa" /><stop offset="1" stop-color="#d946ef" /></linearGradient>
            </defs>
            <g [attr.transform]="'translate(' + padLeft + ' 10)'">
              @for (t of ticks(); track t.y) {
                <line x1="0" [attr.y1]="t.y" [attr.x2]="pw()" [attr.y2]="t.y" stroke="#34314f" stroke-width="1" stroke-dasharray="3 4" />
                <text x="-8" [attr.y]="t.y + 4" text-anchor="end" font-size="11" fill="#8886a8">{{ t.label }}</text>
              }
              <path [attr.d]="area()" fill="url(#rev-fill)" />
              <path data-line [attr.d]="line()" fill="none" stroke="url(#rev-line)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              @for (p of pts(); track p.x) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.4" fill="#0b0b14" stroke="#c4b5fd" stroke-width="2"><title>{{ p.label }}: {{ inr(p.value) }}</title></circle>
              }
              @for (l of xLabels(); track l.x) {
                <text [attr.x]="l.x" [attr.y]="ph + 20" text-anchor="middle" font-size="11" fill="#8886a8">{{ l.text }}</text>
              }
            </g>
          </svg>
          </div>
        </div>

        <!-- Session summary -->
        <div class="card" data-occupancy>
          <h2 class="text-lg font-bold">Session Summary</h2>
          <div class="mt-3 flex flex-wrap items-center gap-5">
            <svg viewBox="0 0 42 42" class="size-28 shrink-0 -rotate-90 sm:size-36" role="img" aria-label="Stations by state">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="#25233b" stroke-width="5" />
              @for (seg of donut(); track seg.color) {
                <circle cx="21" cy="21" r="15.915" fill="none" [attr.stroke]="seg.color" stroke-width="5" stroke-linecap="butt"
                        [attr.stroke-dasharray]="(seg.len - 0.6) + ' ' + (100 - seg.len + 0.6)" [attr.stroke-dashoffset]="-seg.start" />
              }
              <text x="21" y="19.5" transform="rotate(90 21 21)" text-anchor="middle" fill="#f8fafc" font-size="8" font-weight="700">{{ activeStations().length }}</text>
              <text x="21" y="25.5" transform="rotate(90 21 21)" text-anchor="middle" fill="#9a98b8" font-size="3.4">Systems</text>
            </svg>
            <ul class="min-w-0 flex-1 space-y-2 text-xs sm:text-sm">
              <li class="flex items-center justify-between gap-2 whitespace-nowrap"><span><span class="dot bg-violet-500"></span> Occupied</span><b>{{ busyCount() }} <span class="font-normal text-slate-400">({{ share(busyCount()) }}%)</span></b></li>
              <li class="flex items-center justify-between gap-2 whitespace-nowrap"><span><span class="dot bg-emerald-500"></span> Available</span><b>{{ freeCount() }} <span class="font-normal text-slate-400">({{ share(freeCount()) }}%)</span></b></li>
              <li class="flex items-center justify-between gap-2 whitespace-nowrap"><span><span class="dot bg-orange-500"></span> Switched off</span><b>{{ offCount() }} <span class="font-normal text-slate-400">({{ share(offCount()) }}%)</span></b></li>
            </ul>
          </div>
          @for (o of data()?.occupancy ?? []; track o.type) {
            <div class="mt-3">
              <div class="flex justify-between text-xs text-slate-300"><span>{{ o.type.toUpperCase() }}</span><span>{{ o.in_use }} of {{ o.total }} in use</span></div>
              <div class="mt-1 h-2 rounded bg-slate-800"><div class="h-2 rounded bg-linear-to-r from-violet-500 to-fuchsia-500" [style.width.%]="o.total ? (100 * o.in_use) / o.total : 0"></div></div>
            </div>
          }
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <!-- Live sessions -->
        <div class="card" data-live>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold">Live Sessions <span class="text-sm font-normal text-slate-400">(Current)</span></h2>
            <a routerLink="/counter/stations" class="text-sm text-cyan-300 hover:underline">View All →</a>
          </div>
          <div class="mt-2 hidden grid-cols-[4.5rem_1fr_5.5rem_5.5rem_5rem] gap-2 border-b border-slate-800 pb-1 text-xs text-slate-400 sm:grid">
            <span>PC</span><span>Customer</span><span>Started At</span><span>Duration</span><span class="text-right">Amount</span>
          </div>
          <div class="divide-y divide-slate-800">
            @for (s of live(); track s.id) {
              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-2 py-2 text-sm sm:grid-cols-[4.5rem_1fr_5.5rem_5.5rem_5rem]" data-live-row>
                <span class="rounded-md bg-violet-600/60 px-2 py-1 text-center text-xs font-bold text-white">{{ stationName(s.station_id) }}</span>
                <span class="flex min-w-0 items-center gap-2">
                  <span class="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-violet-500 to-cyan-400 text-xs font-bold text-slate-950">{{ initials(s.customer_name) }}</span>
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{{ s.customer_name || 'Walk-in' }}</span>
                    <span class="block truncate text-xs text-slate-400 sm:hidden">{{ time(s.started_at) }}{{ s.pass_name ? ' · ' + s.pass_name + ' pass' : '' }}</span>
                    @if (s.pass_name) { <span class="hidden truncate text-xs text-violet-300 sm:block">{{ s.pass_name }} pass</span> }
                  </span>
                </span>
                <span class="hidden text-slate-300 sm:block">{{ time(s.started_at) }}</span>
                <span class="hidden text-slate-300 sm:block">{{ duration(s) }}</span>
                <span class="text-right">
                  <span class="block text-xs text-slate-400 sm:hidden">{{ duration(s) }}</span>
                  <span class="font-semibold text-orange-400" data-live-amount>{{ inr(amount(s)) }}</span>
                </span>
              </div>
            } @empty { <p class="py-3 text-sm text-slate-400">No session running right now.</p> }
          </div>
        </div>

        <div class="space-y-4">
          <!-- Quick actions -->
          <div class="card">
            <h2 class="text-lg font-bold">Quick Actions</h2>
            <p class="mt-1 text-sm text-slate-300" data-active-passes>
              <a routerLink="/counter/passes" class="text-cyan-300 hover:underline">{{ data()?.active_passes ?? 0 }} active pass{{ (data()?.active_passes ?? 0) === 1 ? '' : 'es' }}</a>
            </p>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <a routerLink="/counter/bookings" class="flex flex-col items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-sm font-medium transition hover:-translate-y-0.5 hover:bg-violet-500/20"><span class="text-violet-300"><app-icon name="calendar" [size]="24" /></span>New Booking</a>
              <a routerLink="/counter/stations" class="flex flex-col items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3 text-sm font-medium transition hover:-translate-y-0.5 hover:bg-cyan-400/20"><span class="text-cyan-300"><app-icon name="play" [size]="24" /></span>Start Session</a>
              <a routerLink="/counter/customers" class="flex flex-col items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-sm font-medium transition hover:-translate-y-0.5 hover:bg-violet-500/20"><span class="text-violet-300"><app-icon name="users" [size]="24" /></span>Add Customer</a>
              <a routerLink="/counter/canteen" class="flex flex-col items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3 text-sm font-medium transition hover:-translate-y-0.5 hover:bg-cyan-400/20"><span class="text-cyan-300"><app-icon name="receipt" [size]="24" /></span>Generate Bill</a>
            </div>
          </div>

          <!-- Highlights -->
          <div class="card relative overflow-hidden" data-highlights>
            <h2 class="flex items-center gap-2 text-lg font-bold"><span class="text-orange-400"><app-icon name="bolt" [size]="18" /></span> Today's Highlights</h2>
            <ul class="mt-2 space-y-1.5 text-sm">
              <li class="flex items-center gap-2"><span class="text-emerald-400"><app-icon name="check" [size]="16" /></span>{{ bookingsToday() }} booking{{ bookingsToday() === 1 ? '' : 's' }} today</li>
              <li class="flex items-center gap-2"><span class="text-emerald-400"><app-icon name="check" [size]="16" /></span>{{ live().length }} session{{ live().length === 1 ? '' : 's' }} running now</li>
              <li class="flex items-center gap-2"><span class="text-emerald-400"><app-icon name="check" [size]="16" /></span>{{ inr(data()?.sales?.passes ?? 0) }} in passes sold</li>
              <li class="flex items-center gap-2"><span [class]="offCount() ? 'text-orange-400' : 'text-emerald-400'"><app-icon name="check" [size]="16" /></span>{{ offCount() }} station{{ offCount() === 1 ? '' : 's' }} switched off</li>
            </ul>
            <div class="pointer-events-none absolute -bottom-3 -right-2 hidden w-32 opacity-90 sm:block" aria-hidden="true"><app-controller-art /></div>
          </div>
        </div>
      </div>

      <!-- Today's sales by kind and by payment mode -->
      <div>
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Today's sales</h2>
        <app-sales-summary [s]="data()?.sales ?? null" />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="card" data-bookings>
          <h2 class="text-lg font-bold">Today's Bookings</h2>
          @if (data(); as d) {
            <dl class="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div><dd class="font-display text-2xl font-bold" data-upcoming>{{ d.bookings.upcoming }}</dd><dt class="text-slate-400">Upcoming</dt></div>
              <div><dd class="font-display text-2xl font-bold">{{ d.bookings.checked_in }}</dd><dt class="text-slate-400">Checked in</dt></div>
              <div><dd class="font-display text-2xl font-bold" data-noshow>{{ d.bookings.no_show }}</dd><dt class="text-slate-400">No-shows</dt></div>
              <div><dd class="font-display text-2xl font-bold">{{ d.bookings.cancelled }}</dd><dt class="text-slate-400">Cancelled</dt></div>
            </dl>
          }
        </div>
        <div class="card space-y-1" data-low-stock>
          <h2 class="text-lg font-bold">Low Stock</h2>
          @for (p of data()?.low_stock ?? []; track p.name) {
            <div class="flex justify-between text-sm"><span>{{ p.name }}</span>
              <span class="text-amber-300">{{ p.stock_qty }} left (alert at {{ p.low_stock_level }})</span></div>
          } @empty { <p class="text-sm text-slate-400">Nothing is running low.</p> }
        </div>
      </div>

      <div class="card space-y-2" data-busy>
        <h2 class="text-lg font-bold">Busiest Hours <span class="text-sm font-normal text-slate-400">(sessions started, last 30 days)</span></h2>
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
export class Dashboard implements OnInit, AfterViewInit, OnDestroy {
  private readonly svc = inject(ReportsService);
  private readonly auth = inject(AuthService);

  protected readonly barH = BAR_H;
  protected readonly ph = PH;
  protected readonly padLeft = PAD_LEFT;
  private readonly chartBox = viewChild<ElementRef<HTMLElement>>('chartBox');
  /** Width of the chart card in pixels (the drawing is made at exactly this size). */
  protected readonly chartWidth = signal(340);
  protected readonly pw = computed(() => Math.max(160, this.chartWidth() - PAD_LEFT - PAD_RIGHT));
  protected readonly ranges: RevenueRange[] = ['week', 'last7', 'last30'];
  protected readonly rangeLabel = RANGE_LABEL;
  protected readonly range = signal<RevenueRange>('week');
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
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  protected readonly firstName = computed(() => {
    const p = this.auth.profile();
    return (p?.full_name || p?.email?.split('@')[0] || 'Admin').split(' ')[0];
  });

  // ---- stations ----
  private readonly busyIds = computed(() => new Set(this.live().map((s) => s.station_id)));
  protected readonly activeStations = computed(() => this.stations().filter((s) => s.active));
  protected readonly busyCount = computed(() => this.activeStations().filter((s) => this.busyIds().has(s.id)).length);
  protected readonly freeCount = computed(() => this.activeStations().length - this.busyCount());
  protected readonly offCount = computed(() => this.stations().length - this.activeStations().length);
  protected readonly donut = computed(() => {
    const [free, busy, off] = donutParts(this.freeCount(), this.busyCount(), this.offCount());
    return [
      { color: '#8b5cf6', len: busy, start: 0 },
      { color: '#22c55e', len: free, start: busy },
      { color: '#ff6b35', len: off, start: busy + free },
    ].filter((s) => s.len > 0);
  });
  protected share(n: number): number {
    const total = this.stations().length;
    return total ? Math.round((100 * n) / total) : 0;
  }

  // ---- revenue overview ----
  protected readonly series = computed(() => revenueSeries(this.trend(), this.range(), todayIst()));
  private readonly max = computed(() => niceMax(Math.max(100, ...this.series().values.map((v) => v ?? 0))));
  protected readonly pts = computed(() => chartPoints(this.series().values, this.series().labels, this.pw(), PH, this.max()));
  protected readonly line = computed(() => smoothPath(this.pts()));
  protected readonly area = computed(() => smoothArea(this.pts(), PH));
  protected readonly ticks = computed(() => yTicks(this.max(), PH));
  protected readonly xLabels = computed(() => {
    const labels = this.series().labels;
    const step = labels.length > 1 ? this.pw() / (labels.length - 1) : 0;
    return labels.map((text, i) => ({ text, x: Math.round(i * step * 10) / 10 })).filter((l) => l.text);
  });
  protected readonly pct = computed(() => pctChange(this.series().total, this.series().prevTotal));
  protected readonly pctAbs = computed(() => Math.abs(this.pct() ?? 0));
  protected readonly vsText = computed(() => (this.range() === 'week' ? 'vs last week' : this.range() === 'last7' ? 'vs the 7 days before' : 'vs the 30 days before'));

  protected readonly bookingsToday = computed(() => {
    const b = this.data()?.bookings;
    return b ? b.upcoming + b.checked_in + b.no_show + b.cancelled : 0;
  });

  // ---- busiest hours ----
  private readonly hourMax = computed(() => Math.max(0, ...this.hours().map((r) => r.session_count)));
  protected readonly busiestText = computed(() => {
    const top = [...this.hours()].filter((r) => r.session_count > 0).sort((a, b) => b.session_count - a.session_count)[0];
    return top ? `Busiest: ${hourLabel(top.hour)} (${top.session_count} sessions)` : 'No sessions yet.';
  });

  protected inr = inr;
  protected hourLabel = hourLabel;
  protected time = formatIstTime;
  protected initials = avatarInitials;
  protected bar(b: HourRow): number {
    return barHeight(b.session_count, this.hourMax(), BAR_H);
  }
  protected state(s: DashStation) {
    return stationState(s, this.busyIds());
  }
  protected amount(s: LiveSession): number {
    return liveAmount(s, this.now());
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

  ngAfterViewInit(): void {
    this.measure();
  }

  @HostListener('window:resize')
  protected measure(): void {
    const w = this.chartBox()?.nativeElement.clientWidth;
    if (w && w > 0) this.chartWidth.set(Math.round(w));
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async load(): Promise<void> {
    try {
      const [d, t, h, st, lv] = await Promise.all([
        this.svc.dashboard(),
        this.svc.trend(60),
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
