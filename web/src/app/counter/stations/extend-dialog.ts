import { Component, computed, inject, input, output, signal } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { OpenSession, Pack, Station } from '../counter.store';

/** Minutes offered for a per-hour session (it keeps billing for the time actually played). */
export const HOURLY_EXTENDS = [30, 60, 90, 120];

/** The package total after adding another package: minutes and price are simply added. */
export function extendedTotal(minutes: number, price: number, add: { minutes: number; price: number }): { minutes: number; price: number } {
  return { minutes: minutes + add.minutes, price: Math.round((price + add.price) * 100) / 100 };
}

/** Extend a running session: add a package (package sessions) or more time on the reminder (per-hour sessions). */
@Component({
  selector: 'app-extend-dialog',
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" [attr.aria-label]="'Extend ' + station().name">
      <div class="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">
        <h2 class="text-lg font-semibold">Extend {{ station().name }}</h2>

        @if (session().pass_id) {
          <p class="text-sm text-slate-300" data-extend-pass>A pass session runs on the customer's pass, so it cannot be extended here.</p>
        } @else if (session().package_minutes !== null) {
          <p class="text-sm text-slate-300">
            This session stays on {{ station().name }}. Now: package “{{ session().package_name }}” · {{ session().package_minutes }} min · ₹{{ session().package_price }}.
            Pick the time to add. Its price is added to the bill.
          </p>
          <div class="space-y-2">
            @for (p of options(); track p.id) {
              <button type="button" class="btn-outline flex w-full items-center justify-between gap-2 !py-2 text-left"
                      [disabled]="busy()" (click)="addPackage(p)" data-extend-package>
                <span>+ {{ p.minutes }} min</span>
                <span class="font-semibold">+₹{{ p.price }} <span class="text-xs font-normal text-slate-400">→ {{ after(p) }}</span></span>
              </button>
            } @empty {
              <p class="text-sm text-amber-300">No active package for this station type. Add one under Admin → Packages.</p>
            }
          </div>
        } @else {
          <p class="text-sm text-slate-300">
            This is a per-hour session: the bill follows the time actually played (₹{{ station().rate_per_hour }}/hr in billing blocks).
            Extending moves the "time is up" reminder.
          </p>
          <div class="grid grid-cols-2 gap-2">
            @for (m of hourly; track m) {
              <button type="button" class="btn-outline !py-2" [disabled]="busy()" (click)="addMinutes(m)" data-extend-minutes>
                + {{ label(m) }}
              </button>
            }
          </div>
        }

        @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }
        <button type="button" class="btn w-full" (click)="closed.emit()">Close</button>
      </div>
    </div>
  `,
})
export class ExtendDialog {
  private readonly sb = inject(SupabaseService).client;

  readonly station = input.required<Station>();
  readonly session = input.required<OpenSession>();
  readonly packages = input.required<Pack[]>();
  readonly done = output<void>();
  readonly closed = output<void>();

  protected readonly hourly = HOURLY_EXTENDS;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly options = computed(() => this.packages().filter((p) => p.station_type === this.station().type));

  protected label(m: number): string {
    return m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  }

  protected after(p: Pack): string {
    const t = extendedTotal(this.session().package_minutes ?? 0, Number(this.session().package_price ?? 0), p);
    return `${t.minutes} min · ₹${t.price}`;
  }

  protected addPackage(p: Pack): Promise<void> {
    return this.run({ p_session: this.session().id, p_package: p.id });
  }

  protected addMinutes(m: number): Promise<void> {
    return this.run({ p_session: this.session().id, p_minutes: m });
  }

  private async run(args: Record<string, unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.sb.rpc('extend_session', args);
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.done.emit();
    this.closed.emit();
  }
}
