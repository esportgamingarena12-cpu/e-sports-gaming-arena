import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { chargeEndMs, formatDuration, playedMs, sessionCharge } from '../../core/pricing';
import { ServerClock } from '../../core/server-clock';
import { ToastService } from '../../shared/toast.service';
import { inr } from '../../shared/format';
import { CounterStore, OpenSession, TabLine } from '../counter.store';
import { BillSource, CheckoutDialog } from '../checkout/checkout-dialog';
import { OvertimeControl } from '../stations/overtime-control';

export interface PendingRow {
  session: OpenSession;
  station: string;
  stopped: boolean;
  played: string;
  gaming: number;
  items: TabLine[];
  canteen: number;
  total: number;
  label: string;
}

/**
 * Pending bills (yet to be billed): sessions that were stopped but never paid, and sessions still running (for a customer
 * who left without staff pressing Stop), each with its gaming charge and the canteen items on its tab.
 * Staff and admin can bill any of them from here, at any time.
 */
@Component({
  selector: 'app-pending-bills',
  imports: [CheckoutDialog, OvertimeControl, RouterLink],
  template: `
    <section class="space-y-3" data-pending-list>
      @if (store.error(); as e) { <p class="rounded bg-red-500/15 p-2 text-sm text-red-300" role="alert">{{ e }}</p> }

      @if (!store.loaded()) {
        <p class="text-slate-400">Loading…</p>
      } @else if (rows().length === 0) {
        <div class="card text-center" data-none>
          <p class="font-semibold text-emerald-300">Nothing is pending.</p>
          <p class="text-sm text-slate-400">Every session has been billed.</p>
        </div>
      } @else {
        <div class="card flex flex-wrap items-center justify-between gap-2" data-summary>
          <p class="text-sm">
            <span class="font-semibold">{{ rows().length }}</span> pending (yet to be billed)
            <span class="text-slate-400">· {{ stoppedCount() }} stopped, {{ rows().length - stoppedCount() }} still running</span>
          </p>
          <p class="font-display text-xl font-bold text-orange-300" data-total>{{ inr(grandTotal()) }}</p>
        </div>

        <ul class="space-y-2" data-list>
          @for (r of rows(); track r.session.id) {
            <li class="card space-y-2" [class]="r.stopped ? '!border-orange-500/50' : ''" [attr.data-pending]="r.station">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-lg font-semibold">{{ r.station }}
                    <span class="ml-1 rounded px-2 py-0.5 text-xs font-medium" [class]="r.stopped ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'">{{ r.stopped ? 'Pending · stopped' : 'Pending · still running' }}</span>
                  </p>
                  <p class="truncate text-sm text-slate-400">{{ r.session.customer_name || 'Walk-in' }}{{ r.session.customer_phone ? ' · ' + r.session.customer_phone : '' }} · {{ r.label }} · played {{ r.played }}</p>
                </div>
                <p class="font-display text-2xl font-bold text-emerald-300">{{ inr(r.total) }}</p>
              </div>
              <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <p class="rounded bg-slate-800/60 px-2 py-1">Gaming <span class="float-right font-medium">{{ inr(r.gaming) }}</span></p>
                <p class="rounded bg-slate-800/60 px-2 py-1">Canteen <span class="float-right font-medium">{{ inr(r.canteen) }}</span></p>
              </div>
              <app-overtime-control [session]="r.session" (changed)="store.load()" />
              @if (r.items.length) {
                <p class="text-sm text-slate-300" data-items>Items: {{ itemsText(r.items) }}</p>
              }
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-primary" [disabled]="busy() === r.session.id" (click)="bill(r)" data-bill>{{ busy() === r.session.id ? 'Opening…' : 'Bill now' }}</button>
                <a class="btn" routerLink="/counter/canteen" [queryParams]="{ tab: r.session.id }">+ Items</a>
                <a class="btn-outline" routerLink="/counter/stations">Stations</a>
              </div>
            </li>
          }
        </ul>
      }

      @if (billFor(); as src) {
        <app-checkout-dialog [source]="src" (billed)="store.load(); billed.emit()" (done)="closeBill()" (closed)="closeBill()" />
      }
    </section>
  `,
})
export class PendingBills {
  protected readonly store = inject(CounterStore);
  private readonly clock = inject(ServerClock);
  private readonly toast = inject(ToastService);

  /** the Bills screen reloads its paid list when one of these has been paid */
  readonly billed = output<void>();
  protected readonly billFor = signal<BillSource | null>(null);
  protected readonly busy = signal<number | null>(null);
  protected inr = inr;

  /** Stopped sessions first (they were left), then the ones still running; each group oldest first. */
  protected readonly rows = computed<PendingRow[]>(() => {
    const now = this.clock.now();
    const names = new Map(this.store.stations().map((s) => [s.id, s.name]));
    const tabs = new Map<number, TabLine[]>();
    for (const t of this.store.tabs()) tabs.set(t.session_id, [...(tabs.get(t.session_id) ?? []), t]);
    return this.store
      .sessions()
      .map((s) => {
        const end = chargeEndMs(s, now);
        const items = tabs.get(s.id) ?? [];
        const canteen = items.reduce((sum, i) => sum + i.price * i.qty, 0);
        const gaming = sessionCharge(s, end);
        return {
          session: s,
          station: names.get(s.station_id) ?? `Station ${s.station_id}`,
          stopped: s.status === 'ended',
          played: formatDuration(playedMs(s, end)),
          gaming,
          items,
          canteen,
          total: Math.round((gaming + canteen) * 100) / 100,
          label: s.pass_name ? `${s.pass_name} pass` : (s.package_name ?? 'per hour'),
        };
      })
      .sort((a, b) => Number(b.stopped) - Number(a.stopped) || Date.parse(a.session.started_at) - Date.parse(b.session.started_at));
  });
  protected readonly stoppedCount = computed(() => this.rows().filter((r) => r.stopped).length);
  protected readonly grandTotal = computed(() => this.rows().reduce((sum, r) => sum + r.total, 0));

  protected itemsText(items: TabLine[]): string {
    return items.map((i) => `${i.qty}× ${i.name}`).join(', ');
  }

  /** Same as Bill on the station card: stop the timer if it is still running, then open the checkout with the server's charge. */
  protected async bill(r: PendingRow): Promise<void> {
    const s = r.session;
    this.busy.set(s.id);
    const { data, error } = await this.store.callData('end_session', { p_session: s.id });
    this.busy.set(null);
    if (error) {
      this.toast.error(error);
      return;
    }
    const ended = this.store.sessions().find((x) => x.id === s.id) ?? s;
    this.billFor.set({
      kind: 'station',
      sessionId: s.id,
      title: r.station,
      gamingLabel: `Gaming – ${r.station} (${r.label})`,
      gaming: Number(data),
      played: formatDuration(playedMs(ended, chargeEndMs(ended, this.clock.now()))),
      customerName: s.customer_name,
      items: r.items.map((t) => ({ productId: t.product_id, name: t.name, qty: t.qty, price: t.price })),
    });
  }

  protected closeBill(): void {
    this.billFor.set(null);
    void this.store.load();
  }
}
