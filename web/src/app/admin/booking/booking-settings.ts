import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, maxAtLeastMin, openBeforeClose } from '../../shared/validators';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Shown Monday first; database weekday 0 = Sunday. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function makeDayGroup(fb: FormBuilder, weekday: number) {
  return fb.nonNullable.group(
    { weekday: [weekday], open_time: ['10:00'], close_time: ['22:00'], closed: [false] },
    { validators: openBeforeClose },
  );
}
type DayGroup = ReturnType<typeof makeDayGroup>;

const hhmm = (t: string) => t.slice(0, 5);

@Component({
  selector: 'app-booking-settings',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <h1 class="text-xl font-semibold">Booking settings</h1>
      @if (!loaded()) {
        <p class="mt-3 text-slate-400">Loading…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" class="mt-4 max-w-xl space-y-4">
          <div class="card space-y-3">
            <h2 class="font-medium">Rules</h2>
            <label class="label">Slot size
              <select formControlName="slot_minutes" class="field">
                <option [ngValue]="15">15 minutes</option>
                <option [ngValue]="30">30 minutes</option>
                <option [ngValue]="60">60 minutes</option>
              </select>
            </label>
            <label class="label">Booking window (days ahead)
              <input formControlName="window_days" type="number" inputmode="numeric" class="field" />
              <app-field-error [control]="form.controls.window_days" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="label">Min slots
                <input formControlName="min_slots" type="number" inputmode="numeric" class="field" />
                <app-field-error [control]="form.controls.min_slots" />
              </label>
              <label class="label">Max slots
                <input formControlName="max_slots" type="number" inputmode="numeric" class="field" />
                <app-field-error [control]="form.controls.max_slots" />
              </label>
            </div>
            @if (form.errors?.['slotRange']) {
              <p class="text-xs text-red-400" role="alert">Max slots must not be below min slots</p>
            }
            <label class="label">Cancellation cutoff (hours before start)
              <input formControlName="cutoff_hours" type="number" inputmode="numeric" class="field" />
              <app-field-error [control]="form.controls.cutoff_hours" />
            </label>
            <label class="label">No-show grace (minutes after start)
              <input formControlName="grace_minutes" type="number" inputmode="numeric" class="field" />
              <app-field-error [control]="form.controls.grace_minutes" />
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Opening hours</h2>
            @for (g of days.controls; track g.controls.weekday.value) {
              <div [formGroup]="g" class="flex flex-wrap items-center gap-2">
                <span class="w-24 text-sm">{{ dayName(g.controls.weekday.value) }}</span>
                <input type="time" formControlName="open_time" class="field mt-0 w-auto" aria-label="Opens" />
                <span class="text-slate-400">to</span>
                <input type="time" formControlName="close_time" class="field mt-0 w-auto" aria-label="Closes" />
                <label class="flex items-center gap-1 text-sm">
                  <input type="checkbox" formControlName="closed" /> Closed
                </label>
                @if (g.errors?.['timeRange']) {
                  <p class="w-full text-xs text-red-400" role="alert">Opening time must be before closing time</p>
                }
              </div>
            }
          </div>

          <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        </form>
      }
    </section>
  `,
})
export class BookingSettings implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  protected readonly days = new FormArray<DayGroup>(DAY_ORDER.map((d) => makeDayGroup(this.fb, d)));
  protected readonly form = this.fb.group(
    {
      slot_minutes: this.fb.nonNullable.control(30),
      window_days: this.fb.nonNullable.control(7, [Validators.required, Validators.min(1), Validators.max(60), integer]),
      min_slots: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1), integer]),
      max_slots: this.fb.nonNullable.control(8, [Validators.required, Validators.min(1), integer]),
      cutoff_hours: this.fb.nonNullable.control(2, [Validators.required, Validators.min(0), integer]),
      grace_minutes: this.fb.nonNullable.control(15, [Validators.required, Validators.min(0), integer]),
    },
    { validators: maxAtLeastMin },
  );

  protected dayName(weekday: number): string {
    return DAY_NAMES[weekday];
  }

  async ngOnInit(): Promise<void> {
    const [bs, oh] = await Promise.all([
      this.sb.from('booking_settings').select('*').maybeSingle(),
      this.sb.from('opening_hours').select('*'),
    ]);
    if (bs.error || oh.error) {
      this.toast.error(friendlyError(bs.error ?? oh.error));
      return;
    }
    if (bs.data) {
      this.form.patchValue({
        slot_minutes: bs.data.slot_minutes,
        window_days: bs.data.window_days,
        min_slots: bs.data.min_slots,
        max_slots: bs.data.max_slots,
        cutoff_hours: bs.data.cutoff_hours,
        grace_minutes: bs.data.grace_minutes,
      });
    }
    for (const row of oh.data ?? []) {
      const g = this.days.controls.find((x) => x.controls.weekday.value === row.weekday);
      g?.patchValue({ open_time: hhmm(row.open_time), close_time: hhmm(row.close_time), closed: row.closed });
    }
    this.loaded.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.days.invalid) {
      this.form.markAllAsTouched();
      this.days.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);

    const settings = await this.sb
      .from('booking_settings')
      .update({
        slot_minutes: Number(v.slot_minutes),
        window_days: Number(v.window_days),
        min_slots: Number(v.min_slots),
        max_slots: Number(v.max_slots),
        cutoff_hours: Number(v.cutoff_hours),
        grace_minutes: Number(v.grace_minutes),
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
      .select('id');
    if (settings.error || !settings.data?.length) {
      this.busy.set(false);
      return this.toast.error(settings.error ? friendlyError(settings.error) : 'Not allowed');
    }

    const results = await Promise.all(
      this.days.controls.map((g) => {
        const d = g.getRawValue();
        return this.sb
          .from('opening_hours')
          .update({ open_time: d.open_time, close_time: d.close_time, closed: d.closed })
          .eq('weekday', d.weekday)
          .select('weekday');
      }),
    );
    this.busy.set(false);
    const failed = results.find((r) => r.error || !r.data?.length);
    if (failed) return this.toast.error(failed.error ? friendlyError(failed.error) : 'Not allowed');
    this.form.markAsPristine();
    this.toast.success('Booking settings saved');
  }
}
