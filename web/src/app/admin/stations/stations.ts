import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank } from '../../shared/validators';

interface Station {
  id: number;
  name: string;
  type: string;
  rate_per_hour: number;
  sort_order: number;
  active: boolean;
  online_bookable: boolean;
}

@Component({
  selector: 'app-stations',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Stations</h1>
        <button type="button" class="btn-primary" (click)="startNew()">+ Station</button>
      </div>

      @if (editingId() !== null) {
        <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 max-w-xl space-y-3">
          <h2 class="font-medium">{{ editingId() === 0 ? 'New station' : 'Edit station' }}</h2>
          <label class="label">Name
            <input formControlName="name" class="field" />
            <app-field-error [control]="form.controls.name" />
          </label>
          <label class="label">Type (for example pc, ps5)
            <input formControlName="type" list="station-types" class="field" />
            <app-field-error [control]="form.controls.type" />
          </label>
          <datalist id="station-types">
            @for (t of types(); track t) { <option [value]="t"></option> }
          </datalist>
          <label class="label">Rate per hour (₹)
            <input formControlName="rate_per_hour" type="number" inputmode="decimal" step="0.01" class="field" />
            <app-field-error [control]="form.controls.rate_per_hour" />
          </label>
          <label class="label">Display order
            <input formControlName="sort_order" type="number" inputmode="numeric" class="field" />
            <app-field-error [control]="form.controls.sort_order" />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="active" /> Active (shown on the counter)
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="online_bookable" /> Open for online booking
          </label>
          @if (editingId() !== 0) {
            <p class="text-xs text-slate-400">Running sessions keep the rate they started with.</p>
          }
          <div class="flex gap-2">
            <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn" (click)="cancel()">Cancel</button>
          </div>
        </form>
      }

      <ul class="mt-4 space-y-2">
        @for (s of stations(); track s.id) {
          <li class="card flex items-center gap-3" [class.opacity-60]="!s.active">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ s.name }}</p>
              <p class="text-sm text-slate-400">
                {{ s.type }} · ₹{{ s.rate_per_hour }}/hr · order {{ s.sort_order }}
                @if (!s.active) { · inactive }
                @if (s.online_bookable) { · online } @else { · walk-in only }
              </p>
            </div>
            <button type="button" class="btn" (click)="edit(s)">Edit</button>
          </li>
        } @empty {
          <li class="text-slate-400">No stations yet.</li>
        }
      </ul>
    </section>
  `,
})
export class Stations implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly stations = signal<Station[]>([]);
  protected readonly types = computed(() => [...new Set(this.stations().map((s) => s.type))].sort());
  /** null = form closed, 0 = new, otherwise the station id being edited */
  protected readonly editingId = signal<number | null>(null);
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    type: ['pc', [Validators.required, notBlank]],
    rate_per_hour: [60, [Validators.required, Validators.min(0)]],
    sort_order: [0, [Validators.required, integer]],
    active: [true],
    online_bookable: [true],
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const { data, error } = await this.sb
      .from('stations')
      .select('id, name, type, rate_per_hour, sort_order, active, online_bookable')
      .order('sort_order')
      .order('name');
    if (error) return this.toast.error(friendlyError(error));
    this.stations.set((data ?? []) as Station[]);
  }

  protected startNew(): void {
    const nextOrder = Math.max(0, ...this.stations().map((s) => s.sort_order)) + 1;
    this.form.reset({ name: '', type: 'pc', rate_per_hour: 60, sort_order: nextOrder, active: true, online_bookable: true });
    this.editingId.set(0);
  }

  protected edit(s: Station): void {
    this.form.reset({
      name: s.name,
      type: s.type,
      rate_per_hour: Number(s.rate_per_hour),
      sort_order: s.sort_order,
      active: s.active,
      online_bookable: s.online_bookable,
    });
    this.editingId.set(s.id);
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
    const row = {
      name: v.name.trim(),
      type: v.type.trim().toLowerCase(),
      rate_per_hour: Number(v.rate_per_hour),
      sort_order: Number(v.sort_order),
      active: v.active,
      online_bookable: v.online_bookable,
    };
    const id = this.editingId();
    this.busy.set(true);
    const result =
      id === 0
        ? await this.sb.from('stations').insert(row).select('id')
        : await this.sb.from('stations').update(row).eq('id', id).select('id');
    this.busy.set(false);
    if (result.error) return this.toast.error(friendlyError(result.error));
    if (!result.data?.length) return this.toast.error('Not allowed');
    this.toast.success(id === 0 ? 'Station added' : 'Station saved');
    this.editingId.set(null);
    await this.load();
  }
}
