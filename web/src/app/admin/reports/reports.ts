import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { todayIst } from '../../shared/format';
import { inr } from '../../shared/format';
import {
  bestSellers,
  buildCsv,
  buildUsageCsv,
  csvFileName,
  hoursText,
  lastDaysRange,
  mostUsedType,
  percentOf,
  rangeError,
  SalesReport,
  slowestSellers,
  thisMonthRange,
  typeName,
  UsageReport,
  usageCsvFileName,
} from './report-utils';
import { ReportsService } from './reports.service';
import { SalesSummaryView } from './sales-summary';

@Component({
  selector: 'app-reports',
  imports: [SalesSummaryView],
  template: `
    <section class="mx-auto max-w-4xl space-y-4 p-4">
      <h1 class="text-xl font-semibold">Reports</h1>

      <div class="card space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="label">From
            <input type="date" class="field" [value]="from()" [max]="today" (change)="from.set($any($event.target).value)" data-from />
          </label>
          <label class="label">To
            <input type="date" class="field" [value]="to()" [max]="today" (change)="to.set($any($event.target).value)" data-to />
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn" (click)="preset('today')">Today</button>
          <button type="button" class="btn" (click)="preset('7')">Last 7 days</button>
          <button type="button" class="btn" (click)="preset('month')">This month</button>
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="run()" data-run>{{ busy() ? 'Loading…' : 'Show report' }}</button>
        </div>
        @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
      </div>

      @if (report(); as r) {
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400" data-range>{{ r.from }} to {{ r.to }}</h2>
          <button type="button" class="btn" (click)="download(r)" data-csv>Export CSV</button>
        </div>
        <app-sales-summary [s]="r" />

        <div class="card space-y-1" data-top-items>
          <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Top 10 items</h2>
          @for (t of r.top_items; track t.name) {
            <div class="flex justify-between gap-2 text-sm"><span class="min-w-0 truncate">{{ t.name }} × {{ t.qty }}</span><span>{{ inr(t.amount) }}</span></div>
          } @empty { <p class="text-sm text-slate-400">No canteen sales in this range.</p> }
        </div>

        @if (usage(); as u) {
          <!-- PC or PS5: which is used more -->
          <div class="card space-y-3" data-usage>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">PC or PS5: what is used more</h2>
              <button type="button" class="btn !px-3 !py-1 !text-xs" (click)="downloadUsage(u)" data-usage-csv>Export usage CSV</button>
            </div>
            @if (leader(); as l) {
              <p class="text-lg font-semibold" data-usage-headline>
                @if (l.tie) { PC and PS5 are used equally } @else { {{ typeName(l.type) }} is used more: {{ l.share }}% of all play time }
              </p>
            } @else {
              <p class="text-sm text-slate-400" data-usage-none>Nothing was played in this range.</p>
            }
            @for (t of u.by_type; track t.type) {
              <div class="space-y-1" [attr.data-usage-type]="t.type">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span class="font-semibold">{{ typeName(t.type) }} <span class="font-normal text-slate-400">· {{ t.stations }} station{{ t.stations === 1 ? '' : 's' }}</span></span>
                  <span>{{ hours(t.minutes) }} · {{ t.sessions }} session{{ t.sessions === 1 ? '' : 's' }} · {{ inr(t.revenue) }}</span>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-slate-800"><div class="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500" [style.width.%]="share(t.minutes)"></div></div>
                <p class="text-xs text-slate-400">{{ share(t.minutes) }}% of the play time</p>
              </div>
            }
            <div class="overflow-x-auto">
              <table class="w-full min-w-[26rem] text-sm" data-usage-stations>
                <thead class="text-left text-xs text-slate-400">
                  <tr><th class="py-1 pr-2">Station</th><th class="pr-2">Kind</th><th class="pr-2 text-right">Sessions</th><th class="pr-2 text-right">Time played</th><th class="text-right">Gaming</th></tr>
                </thead>
                <tbody>
                  @for (s of u.by_station; track s.id) {
                    <tr class="border-t border-slate-800">
                      <td class="py-1 pr-2">{{ s.name }}</td><td class="pr-2 text-slate-400">{{ typeName(s.type) }}</td>
                      <td class="pr-2 text-right">{{ s.sessions }}</td><td class="pr-2 text-right">{{ hours(s.minutes) }}</td><td class="text-right">{{ inr(s.revenue) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- canteen: what sells most and least -->
          <div class="grid gap-4 sm:grid-cols-2" data-canteen-rank>
            <div class="card space-y-2" data-best>
              <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Canteen: sold the most</h2>
              @for (i of best(); track i.name) {
                <div class="space-y-0.5">
                  <div class="flex justify-between gap-2 text-sm"><span class="min-w-0 truncate">{{ i.name }}</span><span class="shrink-0">× {{ i.qty }} · {{ inr(i.amount) }}</span></div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-slate-800"><div class="h-full rounded-full bg-emerald-500" [style.width.%]="bar(i.qty, best()[0].qty)"></div></div>
                </div>
              } @empty { <p class="text-sm text-slate-400">No canteen sales in this range.</p> }
            </div>
            <div class="card space-y-2" data-slowest>
              <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Canteen: sold the least</h2>
              @for (i of slowest(); track i.name) {
                <div class="flex justify-between gap-2 text-sm"><span class="min-w-0 truncate">{{ i.name }}</span>
                  <span class="shrink-0" [class]="i.qty === 0 ? 'text-amber-300' : ''">{{ i.qty === 0 ? 'none sold' : '× ' + i.qty + ' · ' + inr(i.amount) }}</span></div>
              } @empty { <p class="text-sm text-slate-400">No canteen items.</p> }
            </div>
          </div>
        }

        <div class="card" data-daily>
          <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">By day</h2>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full min-w-[32rem] text-sm">
              <thead class="text-left text-xs text-slate-400">
                <tr><th class="py-1 pr-2">Date</th><th class="pr-2 text-right">Bills</th><th class="pr-2 text-right">Gaming</th>
                  <th class="pr-2 text-right">Canteen</th><th class="pr-2 text-right">Passes</th><th class="pr-2 text-right">Disc.</th><th class="pr-2 text-right">Net</th><th class="text-right">Voids</th></tr>
              </thead>
              <tbody>
                @for (d of r.daily; track d.day) {
                  <tr class="border-t border-slate-800">
                    <td class="py-1 pr-2">{{ d.day }}</td><td class="pr-2 text-right">{{ d.bills }}</td>
                    <td class="pr-2 text-right">{{ inr(d.gaming) }}</td><td class="pr-2 text-right">{{ inr(d.canteen) }}</td>
                    <td class="pr-2 text-right">{{ inr(d.passes) }}</td>
                    <td class="pr-2 text-right">{{ inr(d.discounts) }}</td><td class="pr-2 text-right font-medium">{{ inr(d.sales) }}</td>
                    <td class="text-right">{{ d.voids }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
})
export class Reports implements OnInit {
  private readonly svc = inject(ReportsService);

  protected readonly today = todayIst();
  protected readonly from = signal(thisMonthRange(todayIst()).from);
  protected readonly to = signal(todayIst());
  protected readonly report = signal<SalesReport | null>(null);
  protected readonly usage = signal<UsageReport | null>(null);
  protected readonly leader = computed(() => mostUsedType(this.usage()?.by_type ?? []));
  protected readonly best = computed(() => bestSellers(this.usage()?.canteen ?? []));
  protected readonly slowest = computed(() => slowestSellers(this.usage()?.canteen ?? []));
  protected typeName = typeName;
  protected hours = hoursText;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected inr = inr;

  /** a station kind's share of all the hours played */
  protected share(minutes: number): number {
    return percentOf(minutes, (this.usage()?.by_type ?? []).reduce((s, t) => s + t.minutes, 0));
  }

  /** the width of a bar, as a percentage of the longest one */
  protected bar(qty: number, top: number): number {
    return percentOf(qty, top);
  }

  ngOnInit(): void {
    void this.run();
  }

  protected preset(p: 'today' | '7' | 'month'): void {
    const r = p === 'today' ? { from: this.today, to: this.today } : p === '7' ? lastDaysRange(this.today, 7) : thisMonthRange(this.today);
    this.from.set(r.from);
    this.to.set(r.to);
    void this.run();
  }

  protected async run(): Promise<void> {
    const bad = rangeError(this.from(), this.to());
    if (bad) {
      this.error.set(bad);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const [r, u] = await Promise.all([this.svc.report(this.from(), this.to()), this.svc.usage(this.from(), this.to())]);
      this.report.set(r);
      this.usage.set(u);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected downloadUsage(u: UsageReport): void {
    const blob = new Blob(['﻿', buildUsageCsv(u)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = usageCsvFileName(u);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** UTF-8 with a byte order mark, so Excel reads the ₹ in the titles correctly. */
  protected download(r: SalesReport): void {
    const blob = new Blob(['﻿', buildCsv(r)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(r);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
