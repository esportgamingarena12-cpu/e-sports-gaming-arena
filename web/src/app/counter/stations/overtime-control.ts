import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { chargeEndMs, overtimeState } from '../../core/pricing';
import { ServerClock } from '../../core/server-clock';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { ToastService } from '../../shared/toast.service';
import { OpenSession } from '../counter.store';

/**
 * Overtime on a package session: shows how far past the package the customer is, whether it is on the bill, and lets
 * staff decide. Inside the grace period (10 minutes to start with) overtime is free unless staff choose to charge it;
 * beyond it, it is charged in billing blocks unless staff choose not to.
 */
@Component({
  selector: 'app-overtime-control',
  imports: [FormsModule],
  template: `
    @if (state(); as o) {
      <div class="rounded-lg border p-2 text-sm" [class]="o.charged ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/5'" data-overtime>
        <p>
          ⏱ Overtime <span class="font-semibold" data-overtime-minutes>{{ o.overMinutes }} min</span> ·
          @if (o.charged) {
            <span class="font-medium text-amber-300" data-overtime-status>charged +₹{{ (o.customRupees ?? o.ifChargedRupees).toFixed(2) }}{{ o.customRupees !== null ? ' (your amount)' : '' }}</span>
          } @else {
            <span class="font-medium text-emerald-300" data-overtime-status>not charged{{ o.withinGrace && !o.mode ? ' (inside the ' + session().overtime_grace_min + ' min grace)' : '' }}</span>
          }
        </p>
        @if (o.customExpired) {
          <p class="mt-1 text-xs text-amber-200" data-overtime-expired>Your ₹{{ (o.typedRupees ?? 0).toFixed(2) }} no longer applies: the overtime is past the {{ session().overtime_grace_min }} min grace, so the normal block charge is on the bill.</p>
        }
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" class="btn !px-3 !py-1 !text-xs" [class]="o.charged ? '!border-amber-400 !bg-amber-500/20 !text-amber-100' : ''"
                  [disabled]="busy()" (click)="set('charge')" data-overtime-charge>Charge overtime (+₹{{ o.ifChargedRupees.toFixed(2) }})</button>
          <button type="button" class="btn !px-3 !py-1 !text-xs" [class]="!o.charged ? '!border-emerald-400 !bg-emerald-500/20 !text-emerald-100' : ''"
                  [disabled]="busy()" (click)="set('waive')" data-overtime-waive>Don't charge</button>
          @if (o.withinGrace) {
            <span class="flex items-center gap-1" data-overtime-custom>
              <span class="text-xs text-slate-400">or charge</span>
              <input type="number" inputmode="decimal" min="0" step="0.01" class="field !mt-0 !min-h-0 w-24 !py-1 text-sm" placeholder="₹ amount"
                     [ngModel]="amount()" (ngModelChange)="amount.set($event)" [attr.aria-label]="'Overtime amount in rupees'" data-overtime-amount />
              <button type="button" class="btn !px-3 !py-1 !text-xs" [disabled]="busy() || !amountOk()" (click)="setAmount()" data-overtime-amount-save>Set</button>
            </span>
          }
          @if (o.mode) {
            <button type="button" class="text-xs text-slate-400 underline" [disabled]="busy()" (click)="set(null)" data-overtime-auto>Automatic</button>
          }
        </div>
      </div>
    }
  `,
})
export class OvertimeControl {
  private readonly clock = inject(ServerClock);
  private readonly sb = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);

  readonly session = input.required<OpenSession>();
  readonly changed = output<void>();
  protected readonly busy = signal(false);
  /** the rupees typed in the box (inside the grace only) */
  protected readonly amount = signal<number | string | null>(null);
  protected readonly amountOk = computed(() => {
    const v = this.amount();
    return v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100000;
  });

  protected readonly state = computed(() => {
    const s = this.session();
    return overtimeState(s, chargeEndMs(s, this.clock.now()));
  });

  protected setAmount(): Promise<void> {
    return this.set('charge', Math.round(Number(this.amount()) * 100) / 100);
  }

  protected async set(mode: 'charge' | 'waive' | null, amount: number | null = null): Promise<void> {
    this.busy.set(true);
    const { error } = await this.sb.rpc('set_overtime_mode', { p_session: this.session().id, p_mode: mode, p_amount: amount });
    this.busy.set(false);
    if (error) {
      this.toast.error(friendlyError(error));
      return;
    }
    this.amount.set(null);
    this.changed.emit();
  }
}
