import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { formatIstTime, todayIst } from '../../shared/format';
import { notBlank, phone } from '../../shared/validators';
import { slotStartMs } from '../booking-utils';
import { Station } from '../counter.store';

export interface BookingRules {
  slot_minutes: number;
  max_slots: number;
  min_slots: number;
  window_days: number;
}

export interface BookingPrefill {
  name?: string;
  phone?: string;
  stationId?: number;
  day?: string;
  startMinutes?: number;
}

interface SlotOption {
  iso: string;
  label: string;
  free: number;
}

/** A booking made by staff on behalf of a customer (counter or phone). */
@Component({
  selector: 'app-new-booking-dialog',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" aria-label="New booking">
      <form [formGroup]="form" (ngSubmit)="submit()"
            class="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">
        <h2 class="text-lg font-semibold">New booking</h2>

        <label class="label">Customer name
          <input formControlName="name" autocomplete="off" class="field" data-name />
          <app-field-error [control]="form.controls.name" />
        </label>
        <label class="label">Phone
          <input formControlName="phone" inputmode="tel" autocomplete="off" class="field" data-phone />
          <app-field-error [control]="form.controls.phone" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="label">Station type
            <select formControlName="type" class="field" data-type>
              @for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </label>
          <label class="label">Date
            <input type="date" formControlName="day" class="field" [min]="minDay" [max]="maxDay()" data-day />
          </label>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="label">Length
            <select formControlName="slots" class="field" data-slots>
              @for (n of lengths(); track n) { <option [ngValue]="n">{{ lengthLabel(n) }}</option> }
            </select>
          </label>
          <label class="label">Start time
            <select formControlName="start" class="field" data-start>
              @for (o of options(); track o.iso) { <option [value]="o.iso">{{ o.label }}</option> }
              @if (options().length === 0) { <option value="">No free times</option> }
            </select>
          </label>
        </div>
        @if (loadingSlots()) { <p class="text-xs text-slate-400">Checking free times…</p> }
        @else if (options().length === 0) {
          <p class="text-xs text-amber-300" role="alert" data-no-times>No free start times for this type, date and length.</p>
        }

        <label class="label">Station
          <select formControlName="station" class="field" data-station>
            <option [ngValue]="null">Any free station</option>
            @for (s of stationsOfType(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
          </select>
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="label">Booked by
            <select formControlName="channel" class="field" data-channel>
              <option value="counter">At the counter</option>
              <option value="phone">By phone</option>
            </select>
          </label>
          <label class="label">Notes (optional)
            <input formControlName="notes" autocomplete="off" class="field" />
          </label>
        </div>

        @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }

        <div class="flex gap-2">
          <button type="submit" class="btn-primary flex-1" [disabled]="busy() || !form.controls.start.value" data-create>
            {{ busy() ? 'Booking…' : 'Book' }}
          </button>
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        </div>
      </form>
    </div>
  `,
})
export class NewBookingDialog implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);

  readonly stations = input.required<Station[]>();
  readonly rules = input.required<BookingRules>();
  readonly prefill = input<BookingPrefill | null>(null);
  readonly created = output<void>();
  readonly closed = output<void>();

  protected readonly minDay = todayIst();
  protected readonly maxDay = computed(() => this.addDays(todayIst(), this.rules().window_days));
  protected readonly options = signal<SlotOption[]>([]);
  protected readonly loadingSlots = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly types = computed(() => [...new Set(this.stations().map((s) => s.type))].sort());
  protected readonly lengths = computed(() =>
    Array.from({ length: this.rules().max_slots - this.rules().min_slots + 1 }, (_, i) => this.rules().min_slots + i),
  );

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, notBlank]),
    phone: this.fb.nonNullable.control('', [Validators.required, phone]),
    type: this.fb.nonNullable.control(''),
    day: this.fb.nonNullable.control(todayIst()),
    slots: this.fb.nonNullable.control(2),
    start: this.fb.nonNullable.control(''),
    station: this.fb.control<number | null>(null),
    channel: this.fb.nonNullable.control<'counter' | 'phone'>('counter'),
    notes: this.fb.nonNullable.control(''),
  });

  private readonly typeValue = signal('');
  protected readonly stationsOfType = computed(() => this.stations().filter((s) => s.type === this.typeValue()));
  private lastKey = '';

  constructor() {
    this.form.valueChanges.subscribe((v) => {
      this.typeValue.set(v.type ?? '');
      void this.refreshSlots();
    });
  }

  ngOnInit(): void {
    const p = this.prefill();
    const station = p?.stationId ? this.stations().find((s) => s.id === p.stationId) : undefined;
    this.form.patchValue({
      type: station?.type ?? this.types()[0] ?? '',
      day: p?.day ?? todayIst(),
      slots: Math.min(2, this.rules().max_slots),
      station: station?.id ?? null,
      name: p?.name ?? '',
      phone: p?.phone ?? '',
    });
    this.wantedStart = p?.day !== undefined && p.startMinutes !== undefined ? slotStartMs(p.day, p.startMinutes) : null;
  }

  private wantedStart: number | null = null;

  protected lengthLabel(n: number): string {
    const mins = n * this.rules().slot_minutes;
    return mins % 60 === 0 ? `${mins / 60} h` : mins > 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  }

  private addDays(day: string, n: number): string {
    return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  }

  /** Asks the database which start times still have a free station for this type, day and length. */
  private async refreshSlots(): Promise<void> {
    const v = this.form.getRawValue();
    const key = `${v.type}|${v.day}|${v.slots}`;
    if (key === this.lastKey || !v.type || !v.day) return;
    this.lastKey = key;
    this.loadingSlots.set(true);
    const { data, error } = await this.sb.rpc('get_availability', {
      p_station_type: v.type,
      p_date: v.day,
      p_slots: v.slots,
      p_staff_view: true,
    });
    this.loadingSlots.set(false);
    if (key !== this.lastKey) return; // a newer request replaced this one
    if (error) {
      this.options.set([]);
      this.error.set(friendlyError(error));
      return;
    }
    const rows = ((data ?? []) as { slot_start: string; free: number }[]).filter((r) => r.free > 0);
    this.options.set(
      rows.map((r) => ({ iso: r.slot_start, free: r.free, label: `${formatIstTime(r.slot_start)} · ${r.free} free` })),
    );
    const wanted = this.wantedStart === null ? undefined : rows.find((r) => Date.parse(r.slot_start) === this.wantedStart);
    this.form.controls.start.setValue(wanted?.slot_start ?? rows[0]?.slot_start ?? '', { emitEvent: false });
    this.wantedStart = null;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || !this.form.controls.start.value) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.sb.rpc('create_booking', {
      p_station_type: v.type,
      p_start: v.start,
      p_slots: v.slots,
      p_name: v.name.trim(),
      p_phone: v.phone.trim(),
      p_channel: v.channel,
      p_station: v.station,
      p_notes: v.notes.trim() || null,
    });
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      this.lastKey = ''; // the slot may have just been taken: reload the free times
      void this.refreshSlots();
      return;
    }
    this.created.emit();
    this.closed.emit();
  }
}
