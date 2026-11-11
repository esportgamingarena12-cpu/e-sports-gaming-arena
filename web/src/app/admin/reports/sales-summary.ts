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
        <div class="card"><p class="text-xs text-slate-400">Passes</p><p class="text-lg font-medium" data-passes>{{ inr(v.passes ?? 0) }}</p></div>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div class="card"><p class="text-xs text-slate-400">Discounts</p><p class="font-medium" data-discounts>{{ inr(v.discounts) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Cash</p><p class="font-medium" data-cash>{{ inr(v.payments.cash) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">UPI</p><p class="font-medium" data-upi>{{ inr(v.payments.upi) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Card</p><p class="font-medium" data-card>{{ inr(v.payments.card) }}</p></div>
        <div class="card"><p class="text-xs text-slate-400">Void bills</p>
          <p class="font-medium" data-voids>{{ v.void_count }}{{ v.void_count ? ' · ' + inr(v.void_value) : '' }}</p></div>
      </div>
    }
  `,
})
export class SalesSummaryView {
  readonly s = input.required<SalesSummary | null>();
  protected readonly inr = inr;
}
