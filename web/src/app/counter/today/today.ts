import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { SalesReport } from '../../admin/reports/report-utils';
import { ReportsService } from '../../admin/reports/reports.service';
import { SalesSummaryView } from '../../admin/reports/sales-summary';
import { inr } from '../../shared/format';

/** Staff report: today only (decision D11). Admins can open it too. */
@Component({
  selector: 'app-today',
  imports: [SalesSummaryView],
  template: `
    <section class="mx-auto max-w-2xl space-y-4 p-4">
      <h1 class="text-xl font-semibold">Today</h1>
      @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
      @if (report(); as r) {
        <app-sales-summary [s]="r" />
        <div class="card space-y-1" data-top-items>
          <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Top items today</h2>
          @for (t of r.top_items; track t.name) {
            <div class="flex justify-between gap-2 text-sm"><span class="min-w-0 truncate">{{ t.name }} × {{ t.qty }}</span><span>{{ inr(t.amount) }}</span></div>
          } @empty { <p class="text-sm text-slate-400">No canteen sales yet today.</p> }
        </div>
      } @else if (!error()) { <p class="text-sm text-slate-400">Loading…</p> }
    </section>
  `,
})
export class Today implements OnInit, OnDestroy {
  private readonly svc = inject(ReportsService);
  protected readonly report = signal<SalesReport | null>(null);
  protected readonly error = signal<string | null>(null);
  protected inr = inr;
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
      this.report.set(await this.svc.today());
      this.error.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
