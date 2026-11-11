import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { formatIst } from '../../shared/format';
import { FieldError } from '../../shared/field-error';
import { phone } from '../../shared/validators';
import { Pack, Station } from '../counter.store';

interface FoundPass {
  pass_id: number;
  customer_name: string;
  name: string;
  station_type: string | null;
  minutes_left: number | null;
  expires_at: string;
}

/** Start a session: per hour, a package or a customer's pass, plus optional customer name and phone. */
@Component({
  selector: 'app-start-dialog',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" [attr.aria-label]="'Start ' + station().name">
      <form [formGroup]="form" (ngSubmit)="submit()"
            class="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">
        <h2 class="text-lg font-semibold">Start {{ station().name }}</h2>

        @if (warning(); as w) {
          <p class="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-sm text-amber-200" role="alert" data-walkin-warning>
            ⚠ {{ w }}
          </p>
        }

        <div class="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-2" data-pass-box>
          <p class="label !text-violet-200">Customer has a pass?</p>
          <div class="flex gap-2">
            <input formControlName="lookupPhone" inputmode="tel" autocomplete="off" placeholder="Phone number" class="field !mt-0" data-lookup-phone />
            <button type="button" class="btn-outline shrink-0" (click)="lookup()" [disabled]="looking()" data-lookup>{{ looking() ? '…' : 'Find' }}</button>
          </div>
          @if (lookupNote()) { <p class="text-xs text-slate-300" data-lookup-note>{{ lookupNote() }}</p> }
          @for (p of passes(); track p.pass_id) {
            <label class="flex items-center gap-2 rounded border border-violet-500/40 p-2 text-sm">
              <input type="radio" formControlName="passId" [value]="'' + p.pass_id" data-pass-radio />
              <span>{{ p.name }} <span class="text-slate-400">· {{ p.customer_name }} · {{ p.minutes_left === null ? 'unlimited' : p.minutes_left + ' min left' }} · until {{ expires(p.expires_at) }}</span></span>
            </label>
          }
          @if (form.controls.passId.value) {
            <button type="button" class="text-xs text-slate-400 underline" (click)="form.controls.passId.setValue('')">Use normal billing instead</button>
          }
        </div>

        <fieldset class="space-y-2" [class.hidden]="!!form.controls.passId.value">
          <legend class="label">Billing</legend>
          <label class="flex items-center gap-2 rounded border border-slate-700 p-2 text-sm">
            <input type="radio" formControlName="plan" value="hour" />
            <span>Per hour <span class="text-slate-400">· ₹{{ station().rate_per_hour }}/hr</span></span>
          </label>
          @for (p of options(); track p.id) {
            <label class="flex items-center gap-2 rounded border border-slate-700 p-2 text-sm">
              <input type="radio" formControlName="plan" [value]="'' + p.id" />
              <span>{{ p.name }} <span class="text-slate-400">· {{ p.minutes }} min · ₹{{ p.price }}</span></span>
            </label>
          }
        </fieldset>

        @if (!form.controls.passId.value) {
          <label class="label">Customer name (optional)
            <input formControlName="name" autocomplete="off" class="field" />
          </label>
          <label class="label">Phone (optional)
            <input formControlName="phone" inputmode="tel" autocomplete="off" class="field" />
            <app-field-error [control]="form.controls.phone" />
          </label>
        }

        @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }

        <div class="flex gap-2">
          <button type="submit" class="btn-primary flex-1" [disabled]="busy()">{{ busy() ? 'Starting…' : 'Start timer' }}</button>
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        </div>
      </form>
    </div>
  `,
})
export class StartDialog {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);

  readonly station = input.required<Station>();
  readonly packages = input.required<Pack[]>();
  /** Shown when this station has a booking soon (walk-in conflict); starting is still allowed. */
  readonly warning = input<string | null>(null);
  readonly started = output<void>();
  readonly closed = output<void>();

  protected readonly options = computed(() => this.packages().filter((p) => p.station_type === this.station().type));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    plan: ['hour'],
    name: [''],
    phone: ['', [phone]],
    lookupPhone: [''],
    passId: [''],
  });

  protected readonly passes = signal<FoundPass[]>([]);
  protected readonly looking = signal(false);
  protected readonly lookupNote = signal<string | null>(null);
  protected expires = (iso: string): string => formatIst(iso);

  /** Finds the passes a customer can use on this kind of station, by phone number. */
  protected async lookup(): Promise<void> {
    const k = this.form.controls.lookupPhone.value.replace(/\D/g, '');
    this.passes.set([]);
    this.form.controls.passId.setValue('');
    if (k.length < 7) {
      this.lookupNote.set('Enter the full phone number (at least 7 digits).');
      return;
    }
    this.looking.set(true);
    const { data, error } = await this.sb.rpc('lookup_passes', { p_phone: k });
    this.looking.set(false);
    if (error) {
      this.lookupNote.set(friendlyError(error));
      return;
    }
    const type = this.station().type;
    const usable = ((data ?? []) as FoundPass[]).filter((p) => p.station_type === null || p.station_type === type);
    this.passes.set(usable);
    this.lookupNote.set(usable.length ? null : 'No usable pass for this station type.');
    if (usable.length) this.form.controls.passId.setValue('' + usable[0].pass_id);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    const { error } = v.passId
      ? await this.sb.rpc('start_pass_session', { p_station: this.station().id, p_pass: Number(v.passId) })
      : await this.sb.rpc('start_session', {
          p_station: this.station().id,
          p_package: v.plan === 'hour' ? null : Number(v.plan),
          p_name: v.name.trim() || null,
          p_phone: v.phone.trim() || null,
        });
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      this.started.emit(); // refresh the board: the station may already be taken
      return;
    }
    this.started.emit();
    this.closed.emit();
  }
}
