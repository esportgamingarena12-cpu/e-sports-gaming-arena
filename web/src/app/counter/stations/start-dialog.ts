import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { phone } from '../../shared/validators';
import { Pack, Station } from '../counter.store';

/** Start a session: per hour or a package, plus optional customer name and phone. */
@Component({
  selector: 'app-start-dialog',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" [attr.aria-label]="'Start ' + station().name">
      <form [formGroup]="form" (ngSubmit)="submit()"
            class="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">
        <h2 class="text-lg font-semibold">Start {{ station().name }}</h2>

        <fieldset class="space-y-2">
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

        <label class="label">Customer name (optional)
          <input formControlName="name" autocomplete="off" class="field" />
        </label>
        <label class="label">Phone (optional)
          <input formControlName="phone" inputmode="tel" autocomplete="off" class="field" />
          <app-field-error [control]="form.controls.phone" />
        </label>

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
  readonly started = output<void>();
  readonly closed = output<void>();

  protected readonly options = computed(() => this.packages().filter((p) => p.station_type === this.station().type));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    plan: ['hour'],
    name: [''],
    phone: ['', [phone]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.sb.rpc('start_session', {
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
