import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { chargeEndMs, formatDuration, overtimeState, playedMs, sessionCharge } from '../../core/pricing';
import { ServerClock } from '../../core/server-clock';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { formatIst, inr } from '../../shared/format';
import { OpenSession } from '../counter.store';
import { endTimeProblem, istInputValue, parseIstInput, withEnd } from './end-time';

/**
 * "Customer left earlier": set the real end time of a session nobody stopped. The price is shown live for the chosen time,
 * a reason is required, and the change is recorded (who, when, from what to what) and shown on the bill.
 */
@Component({
  selector: 'app-end-time-dialog',
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" [attr.aria-label]="'Set end time for ' + stationName()">
      <div class="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">
        <h2 class="text-lg font-semibold">When did {{ session().customer_name || 'the customer' }} leave? <span class="text-slate-400">· {{ stationName() }}</span></h2>
        <p class="text-sm text-slate-400">Started {{ started() }}. The bill will count only the time up to the end time you choose.</p>

        <label class="label">End time (India time)
          <input type="datetime-local" class="field" [ngModel]="shownText()" (ngModelChange)="endText.set($event)"
                 [min]="minText()" [max]="maxText()" step="60" data-end-time />
        </label>

        <label class="label">Reason (needed, saved with the bill)
          <input class="field" maxlength="200" placeholder="e.g. left at 5:10 pm, nobody pressed Stop" [ngModel]="reason()" (ngModelChange)="reason.set($event)" data-end-reason />
        </label>

        @if (problem(); as p) {
          <p class="text-sm text-red-400" role="alert" data-end-problem>{{ p }}</p>
        } @else if (preview(); as v) {
          <div class="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-sm" data-end-preview>
            <p>Played <span class="font-semibold">{{ v.played }}</span> · gaming charge <span class="text-lg font-bold text-emerald-300">{{ inr(v.charge) }}</span></p>
            @if (v.over) { <p class="mt-1 text-xs text-slate-300">Includes overtime of {{ v.over }} min ({{ v.overCharged ? 'charged' : 'not charged' }}).</p> }
            <p class="mt-1 text-xs text-slate-400">Without the change: {{ inr(v.current) }} (up to now).</p>
          </div>
        }

        @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }
        <div class="flex gap-2">
          <button type="button" class="btn-primary flex-1" [disabled]="busy() || !!problem() || reason().trim().length < 3" (click)="save()" data-end-save>
            {{ busy() ? 'Saving…' : 'Save end time' }}
          </button>
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        </div>
      </div>
    </div>
  `,
})
export class EndTimeDialog {
  private readonly clock = inject(ServerClock);
  private readonly sb = inject(SupabaseService).client;

  readonly session = input.required<OpenSession>();
  readonly stationName = input.required<string>();
  readonly saved = output<void>();
  readonly closed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reason = signal('');
  private readonly openedAt = this.clock.now();
  /** what the person typed; empty until they change it */
  protected readonly endText = signal('');
  protected readonly shownText = computed(() => this.endText() || this.defaultText());
  private readonly defaultText = computed(() => {
    const s = this.session();
    return istInputValue(s.ended_at ? Date.parse(s.ended_at) : this.openedAt);
  });
  protected inr = inr;

  protected readonly started = computed(() => formatIst(this.session().started_at));
  protected readonly minText = computed(() => istInputValue(Date.parse(this.session().started_at)));
  protected readonly maxText = computed(() => istInputValue(this.clock.now()));

  private readonly endMs = computed(() => parseIstInput(this.shownText()));
  protected readonly problem = computed(() => endTimeProblem(this.session(), this.endMs(), this.clock.now()));

  protected readonly preview = computed(() => {
    const ms = this.endMs();
    const s = this.session();
    if (ms === null || endTimeProblem(s, ms, this.clock.now())) return null;
    const as = withEnd(s, ms);
    const o = overtimeState(as, ms);
    return {
      played: formatDuration(playedMs(as, ms)),
      charge: sessionCharge(as, ms),
      current: sessionCharge(s, chargeEndMs(s, this.clock.now())),
      over: o?.overMinutes ?? 0,
      overCharged: o?.charged ?? false,
    };
  });

  protected async save(): Promise<void> {
    const ms = this.endMs();
    if (ms === null || this.problem()) return;
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.sb.rpc('set_session_end_time', { p_session: this.session().id, p_end: new Date(ms).toISOString(), p_reason: this.reason().trim() });
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.saved.emit();
    this.closed.emit();
  }
}
