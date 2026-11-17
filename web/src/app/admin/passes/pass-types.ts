import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank } from '../../shared/validators';

export interface PassType {
  id: number;
  name: string;
  price: number;
  original_price: number | null;
  validity_days: number;
  station_type: string | null;
  kind: 'unlimited' | 'hours';
  minutes_total: number | null;
  active: boolean;
  popular: boolean;
}

/** "20 h", "1 h 30 min" */
export function bundleText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

@Component({
  selector: 'app-pass-types',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="page-title">Pass setup</h1>
          <p class="text-sm text-slate-400">Prepaid passes the counter can sell. Sold passes keep the terms they were bought with.</p>
        </div>
        <button type="button" class="btn-primary shrink-0" (click)="startNew()" data-new>+ Pass</button>
      </div>

      @if (editingId() !== null) {
        <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 max-w-xl space-y-3" data-form>
          <h2 class="font-medium">{{ editingId() === 0 ? 'New pass' : 'Edit pass' }}</h2>
          <label class="label">Name
            <input formControlName="name" class="field" data-name />
            <app-field-error [control]="form.controls.name" />
          </label>
          <p class="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2 text-xs text-slate-300" data-hint>
            Daily pass: valid for <b>1</b> day (it is shown with "Subject to seat availability"). Monthly plan: valid for <b>30</b> days, with a usual price to show the discount.
            Any number of customers can buy the same pass.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <label class="label">Price (₹)
              <input formControlName="price" type="number" inputmode="decimal" step="0.01" class="field" data-price />
              <app-field-error [control]="form.controls.price" />
            </label>
            <label class="label">Valid for (days)
              <input formControlName="validity_days" type="number" inputmode="numeric" class="field" data-days />
              <app-field-error [control]="form.controls.validity_days" />
            </label>
          </div>
          <label class="label">Usual price (₹), optional
            <input formControlName="original_price" type="number" inputmode="decimal" step="0.01" class="field" placeholder="Leave empty for no discount" data-original-price />
            <span class="mt-1 block text-xs text-slate-400">Shown crossed out with "Save n%" next to the price above.</span>
          </label>
          <label class="label">Games
            <select formControlName="station_type" class="field" data-games>
              <option value="">All games</option>
              @for (t of types(); track t) { <option [value]="t">{{ t.toUpperCase() }} only</option> }
            </select>
          </label>
          <label class="label">What it gives
            <select formControlName="kind" class="field" data-kind>
              <option value="unlimited">Unlimited play</option>
              <option value="hours">A bundle of hours</option>
            </select>
          </label>
          @if (form.controls.kind.value === 'hours') {
            <label class="label">Hours in the bundle
              <input formControlName="hours" type="number" inputmode="decimal" step="0.25" class="field" data-hours />
              <app-field-error [control]="form.controls.hours" />
            </label>
            <p class="text-xs text-slate-400">Time beyond the bundle is billed at the normal hourly rate.</p>
          }
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="active" /> Active (can be sold)
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="popular" data-popular /> Show "Most popular" on the booking page
          </label>
          @if (error()) { <p class="text-sm text-red-400" role="alert" data-error>{{ error() }}</p> }
          <div class="flex gap-2">
            <button type="submit" class="btn-primary" [disabled]="busy()" data-save>{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn" (click)="cancel()">Cancel</button>
          </div>
        </form>
      }

      <ul class="mt-4 space-y-2" data-list>
        @for (p of passes(); track p.id) {
          <li class="card flex flex-wrap items-center gap-3" [class.opacity-60]="!p.active" [attr.data-pass]="p.name">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ p.name }}</p>
              <p class="text-sm text-slate-400">
                ₹{{ p.price }}@if (p.original_price) { <span class="line-through"> ₹{{ p.original_price }}</span> } · {{ p.validity_days }} day{{ p.validity_days === 1 ? '' : 's' }} ·
                {{ p.station_type ? p.station_type.toUpperCase() : 'All games' }} ·
                {{ p.kind === 'unlimited' ? 'unlimited play' : bundle(p.minutes_total) }}
                @if (p.popular) { · most popular }
                @if (!p.active) { · inactive }
              </p>
            </div>
            <button type="button" class="btn" (click)="edit(p)" data-edit>Edit</button>
            <div class="flex w-full flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
              @if (rowDelete() === p.id) {
                <span class="text-sm text-red-300">Delete {{ p.name }}? A pass already sold is hidden instead.</span>
                <button type="button" class="btn-danger !px-3 !py-1 !text-sm" (click)="removeRow(p)" data-row-delete-yes>Yes, delete</button>
                <button type="button" class="btn !px-3 !py-1 !text-sm" (click)="rowDelete.set(null)">Keep</button>
              } @else {
                <button type="button" class="btn ml-auto !px-3 !py-1 !text-sm text-red-300" (click)="rowDelete.set(p.id)" data-row-delete>Delete</button>
              }
            </div>
          </li>
        } @empty {
          <li class="text-slate-400">No passes yet. Add one to start selling.</li>
        }
      </ul>
    </section>
  `,
})
export class PassTypes implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly passes = signal<PassType[]>([]);
  protected readonly types = signal<string[]>([]);
  protected readonly editingId = signal<number | null>(null);
  protected readonly busy = signal(false);
  /** the pass waiting for a yes to its delete */
  protected readonly rowDelete = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    price: [0, [Validators.required, Validators.min(0)]],
    original_price: [null as number | null, [Validators.min(0)]],
    validity_days: [30, [Validators.required, Validators.min(1), Validators.max(366), integer]],
    station_type: [''],
    kind: ['unlimited' as 'unlimited' | 'hours'],
    hours: [10, [Validators.min(0.25)]],
    active: [true],
    popular: [false],
  });

  protected bundle(minutes: number | null): string {
    return minutes === null ? '' : bundleText(minutes);
  }

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const [pt, st] = await Promise.all([
      this.sb
        .from('pass_types')
        .select('id, name, price, original_price, validity_days, station_type, kind, minutes_total, active, popular')
        .order('active', { ascending: false })
        .order('name'),
      this.sb.from('stations').select('type'),
    ]);
    if (pt.error) return this.toast.error(friendlyError(pt.error));
    this.passes.set((pt.data ?? []) as PassType[]);
    this.types.set([...new Set((st.data ?? []).map((s) => s.type as string))].sort());
  }

  /** A pass nobody has bought is removed for good; one that was sold is only hidden, so customers keep their history. */
  protected async removeRow(p: PassType): Promise<void> {
    const del = await this.sb.from('pass_types').delete().eq('id', p.id).select('id');
    this.rowDelete.set(null);
    if (!del.error && del.data?.length) {
      this.toast.success('Pass deleted');
    } else if (del.error?.code === '23503') {
      const hide = await this.sb.from('pass_types').update({ active: false }).eq('id', p.id).select('id');
      if (hide.error || !hide.data?.length) return this.toast.error(hide.error ? friendlyError(hide.error) : 'Not allowed');
      this.toast.success('This pass has been sold, so it was hidden instead of deleted');
    } else {
      return this.toast.error(del.error ? friendlyError(del.error) : 'Not allowed');
    }
    await this.load();
  }

  protected startNew(): void {
    this.form.reset({ name: '', price: 0, original_price: null, validity_days: 30, station_type: '', kind: 'unlimited', hours: 10, active: true, popular: false });
    this.error.set(null);
    this.editingId.set(0);
  }

  protected edit(p: PassType): void {
    this.form.reset({
      name: p.name,
      price: Number(p.price),
      original_price: p.original_price === null ? null : Number(p.original_price),
      validity_days: p.validity_days,
      station_type: p.station_type ?? '',
      kind: p.kind,
      hours: p.minutes_total ? p.minutes_total / 60 : 10,
      active: p.active,
      popular: p.popular,
    });
    this.error.set(null);
    this.editingId.set(p.id);
  }

  protected cancel(): void {
    this.editingId.set(null);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const hours = v.kind === 'hours';
    if (hours && !(Number(v.hours) > 0)) {
      this.error.set('Enter the hours in the bundle');
      return;
    }
    const original = v.original_price === null || (v.original_price as unknown) === '' ? null : Number(v.original_price);
    if (original !== null && !(original > Number(v.price))) {
      this.error.set('The usual price must be higher than the price');
      return;
    }
    const row = {
      name: v.name.trim(),
      price: Number(v.price),
      original_price: original,
      validity_days: Number(v.validity_days),
      station_type: v.station_type || null,
      kind: v.kind,
      minutes_total: hours ? Math.round(Number(v.hours) * 60) : null,
      active: v.active,
      popular: v.popular,
    };
    const id = this.editingId();
    this.busy.set(true);
    this.error.set(null);
    const result =
      id === 0
        ? await this.sb.from('pass_types').insert(row).select('id')
        : await this.sb.from('pass_types').update(row).eq('id', id).select('id');
    this.busy.set(false);
    if (result.error) {
      this.error.set(friendlyError(result.error));
      return;
    }
    if (!result.data?.length) {
      this.error.set('Not allowed');
      return;
    }
    this.toast.success(id === 0 ? 'Pass added' : 'Pass saved');
    this.editingId.set(null);
    await this.load();
  }
}
