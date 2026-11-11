import { Component, inject, OnInit, signal } from '@angular/core';
import { todayIst } from '../../shared/format';
import { inr } from '../../shared/format';
import { buildCsv, csvFileName, lastDaysRange, rangeError, SalesReport, thisMonthRange } from './report-utils';
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
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected inr = inr;

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
      this.report.set(await this.svc.report(this.from(), this.to()));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
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
