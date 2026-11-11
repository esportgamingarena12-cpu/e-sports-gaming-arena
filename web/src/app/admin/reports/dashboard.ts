import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatIst, inr } from '../../shared/format';
import { barHeight, DashboardData, HourRow, hourLabel, linePoints, niceMax, TrendRow } from './report-utils';
import { ReportsService } from './reports.service';
import { SalesSummaryView } from './sales-summary';

const CHART_W = 300;
const CHART_H = 100;
const BAR_H = 70;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, SalesSummaryView],
  template: `
    <section class="mx-auto max-w-4xl space-y-4 p-4">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-xl font-semibold">Dashboard</h1>
        <a routerLink="/admin/reports" class="btn" data-reports-link>Reports</a>
      </div>
      @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

      @if (data(); as d) {
        <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Today's sales</h2>
        <app-sales-summary [s]="d.sales" />

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="card space-y-2" data-occupancy>
            <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Live occupancy</h2>
            @for (o of d.occupancy; track o.type) {
              <div>
                <div class="flex justify-between text-sm"><span>{{ o.type.toUpperCase() }}</span><span>{{ o.in_use }} of {{ o.total }} in use</span></div>
                <div class="mt-1 h-2 rounded bg-slate-800"><div class="h-2 rounded bg-emerald-500" [style.width.%]="o.total ? (100 * o.in_use) / o.total : 0"></div></div>
              </div>
            } @empty { <p class="text-sm text-slate-400">No stations yet.</p> }
          </div>

          <div class="card" data-bookings>
            <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Today's bookings</h2>
            <dl class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><dt class="text-slate-400">Upcoming</dt><dd class="text-lg font-medium" data-upcoming>{{ d.bookings.upcoming }}</dd></div>
              <div><dt class="text-slate-400">Checked in</dt><dd class="text-lg font-medium">{{ d.bookings.checked_in }}</dd></div>
              <div><dt class="text-slate-400">No-shows</dt><dd class="text-lg font-medium" data-noshow>{{ d.bookings.no_show }}</dd></div>
              <div><dt class="text-slate-400">Cancelled</dt><dd class="text-lg font-medium">{{ d.bookings.cancelled }}</dd></div>
            </dl>
          </div>
        </div>

        <div class="card space-y-1" data-low-stock>
          <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Low stock</h2>
          @for (p of d.low_stock; track p.name) {
            <div class="flex justify-between text-sm"><span>{{ p.name }}</span>
              <span class="text-amber-300">{{ p.stock_qty }} left (alert at {{ p.low_stock_level }})</span></div>
          } @empty { <p class="text-sm text-slate-400">Nothing is running low.</p> }
        </div>
      }

      <div class="card space-y-2" data-trend>
        <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Last 30 days</h2>
        @if (trend().length) {
          <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="w-full" role="img"
               aria-label="Daily sales and occupancy for the last 30 days" preserveAspectRatio="none" style="height: 9rem">
            <line x1="0" [attr.y1]="h" [attr.x2]="w" [attr.y2]="h" stroke="currentColor" class="text-slate-700" />
            <polyline fill="none" stroke="#10b981" stroke-width="1.5" vector-effect="non-scaling-stroke" [attr.points]="salesLine()" />
            <polyline fill="none" stroke="#f59e0b" stroke-width="1.5" vector-effect="non-scaling-stroke" [attr.points]="occLine()" />
          </svg>
          <div class="flex justify-between text-xs text-slate-500"><span>{{ trend()[0].day }}</span><span>{{ trend()[trend().length - 1].day }}</span></div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span class="text-emerald-400">━ Sales (top of chart = {{ inr(salesMax()) }})</span>
            <span class="text-amber-400">━ Occupancy (top = 100%)</span>
          </div>
          <p class="text-xs text-slate-400" data-trend-total>
            30-day sales {{ inr(trendTotal()) }} · average occupancy {{ avgOcc() }}%
          </p>
        } @else { <p class="text-sm text-slate-400">Loading…</p> }
      </div>

      <div class="card space-y-2" data-busy>
        <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Busiest hours (sessions started, last 30 days)</h2>
        @if (hours().length) {
          <svg [attr.viewBox]="'0 0 240 ' + (barH + 12)" class="w-full" role="img" aria-label="Sessions started by hour of day">
            @for (b of hours(); track b.hour) {
              <rect [attr.x]="b.hour * 10 + 1" [attr.y]="barH - bar(b)" width="8" [attr.height]="bar(b)" fill="#10b981" rx="1">
                <title>{{ hourLabel(b.hour) }}: {{ b.session_count }} sessions</title>
              </rect>
            }
            @for (t of [0, 6, 12, 18]; track t) {
              <text [attr.x]="t * 10 + 5" [attr.y]="barH + 10" font-size="7" text-anchor="middle" fill="currentColor" class="text-slate-500">{{ hourLabel(t) }}</text>
            }
          </svg>
          <p class="text-xs text-slate-400" data-busiest>{{ busiestText() }}</p>
        }
      </div>

      @if (updated()) { <p class="text-xs text-slate-500">Updated {{ updated() }}. Refreshes every 30 seconds.</p> }
    </section>
  `,
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly svc = inject(ReportsService);

  protected readonly w = CHART_W;
  protected readonly h = CHART_H;
  protected readonly barH = BAR_H;
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly trend = signal<TrendRow[]>([]);
  protected readonly hours = signal<HourRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly updated = signal<string | null>(null);

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
  protected bar(b: HourRow): number {
    return barHeight(b.session_count, this.hourMax(), BAR_H);
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
      const [d, t, h] = await Promise.all([this.svc.dashboard(), this.svc.trend(30), this.svc.busyHours(30)]);
      this.data.set(d);
      this.trend.set(t);
      this.hours.set(h);
      this.error.set(null);
      this.updated.set(formatIst(new Date().toISOString()));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
