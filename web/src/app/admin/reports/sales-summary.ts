import { Component, input } from '@angular/core';
import { inr } from '../../shared/format';
import { SalesSummary } from './report-utils';

/** Sales figures shared by the dashboard, the reports screen and the staff Today screen. */
@Component({
  selector: 'app-sales-summary',
  template: `
    @if (s(); as v) {
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-summary>
        <div class="card"><p class="text-xs text-slate-400">Net sales</p><p class="text-xl font-semibold" data-net>{{ inr(v.net_sales) }}</p>
          <p class="text-xs text-slate-500">{{ v.bills }} bill{{ v.bills === 1 ? '' : 's' }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Gaming</p><p class="text-lg font-medium" data-gaming>{{ inr(v.gaming) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Canteen</p><p class="text-lg font-medium" data-canteen>{{ inr(v.canteen) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Passes</p><p class="text-lg font-medium" data-passes>{{ inr(v.passes) }}</p></div>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div class="card"><p class="text-xs text-slate-400">Discounts</p><p class="font-medium" data-discounts>{{ inr(v.discounts) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Cash</p><p class="font-medium" data-cash>{{ inr(v.payments.cash) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">UPI</p><p class="font-medium" data-upi>{{ inr(v.payments.upi) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Card</p><p class="font-medium" data-card>{{ inr(v.payments.card) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Void bills</p>
          <p class="font-medium" data-voids>{{ v.void_count }}{{ v.void_count ? ' · ' + inr(v.void_value) : '' }}</p></div>
      </div>
      @if ((v.happy_sessions ?? 0) > 0) {
        <div class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3" data-happy-line>
          <p class="flex items-center gap-2 text-sm text-emerald-100">
            <span class="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-slate-950">Happy hour</span>
            Discount given on {{ v.happy_sessions }} session{{ v.happy_sessions === 1 ? '' : 's' }}
          </p>
          <p class="font-display text-xl font-bold text-emerald-300" data-happy-discount>{{ inr(v.happy_discount ?? 0) }}</p>
        </div>
      }
    }
  `,
})
export class SalesSummaryView {
  readonly s = input.required<SalesSummary | null>();
  protected readonly inr = inr;
}
