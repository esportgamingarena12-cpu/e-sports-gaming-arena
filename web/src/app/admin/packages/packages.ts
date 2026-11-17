import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank } from '../../shared/validators';
import { scrollToForm } from '../../shared/scroll-to-form';
import { Icon } from '../../shared/icon';

interface Pack {
  id: number;
  name: string;
  minutes: number;
  price: number;
  station_type: string;
  active: boolean;
}

@Component({
  selector: 'app-packages',
  imports: [Icon, ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Packages</h1>
        <button type="button" class="btn-primary" (click)="startNew()">+ Package</button>
      </div>

      @if (editingId() !== null) {
        <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 max-w-xl space-y-3">
          <h2 class="font-medium">{{ editingId() === 0 ? 'New package' : 'Edit package' }}</h2>
          <label class="label">Name
            <input formControlName="name" class="field" />
            <app-field-error [control]="form.controls.name" />
          </label>
          <label class="label">Station type
            <input formControlName="station_type" list="package-types" class="field" />
            <app-field-error [control]="form.controls.station_type" />
          </label>
          <datalist id="package-types">
            @for (t of types(); track t) { <option [value]="t"></option> }
          </datalist>
          <label class="label">Minutes
            <input formControlName="minutes" type="number" inputmode="numeric" class="field" />
            <app-field-error [control]="form.controls.minutes" />
          </label>
          <label class="label">Price (₹)
            <input formControlName="price" type="number" inputmode="decimal" step="0.01" class="field" />
            <app-field-error [control]="form.controls.price" />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="active" /> Active
          </label>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn" (click)="cancel()">Cancel</button>
            @if (editingId() !== 0 && !formDelete()) {
              <button type="button" class="btn ml-auto text-red-300" (click)="formDelete.set(true)" data-delete>Delete</button>
            }
          </div>
          @if (editingId() !== 0 && formDelete()) {
            <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm" data-delete-confirm>
              <p>Delete this package? One already used is hidden instead.</p>
              <div class="mt-2 flex gap-2">
                <button type="button" class="btn-danger" (click)="removeFromForm()" data-delete-yes>Yes, delete</button>
                <button type="button" class="btn" (click)="formDelete.set(false)">Keep</button>
              </div>
            </div>
          }
        </form>
      }

      <ul class="mt-4 space-y-2">
        @for (p of packages(); track p.id) {
          <li class="card flex flex-wrap items-center gap-3" [class.opacity-60]="!p.active" [attr.data-package]="p.name">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ p.name }}</p>
              <p class="text-sm text-slate-400">
                {{ p.station_type }} · {{ p.minutes }} min · ₹{{ p.price }}
                @if (!p.active) { · inactive }
              </p>
            </div>
            <button type="button" class="btn" (click)="edit(p)" data-edit>Edit</button>
            <button type="button" class="btn-outline !px-3 !py-1 !text-sm" (click)="toggleActive(p)" data-toggle-active>
                {{ p.active ? 'Make inactive' : 'Make active' }}
              </button>
            <button type="button" class="inline-flex size-9 items-center justify-center rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/15" (click)="rowDelete.set(p.id)" [attr.aria-label]="'Delete ' + p.name" title="Delete" data-row-delete><app-icon name="trash" [size]="18" /></button>
            @if (rowDelete() === p.id) {
              <div class="flex w-full flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2">
                <span class="text-sm text-red-300">Delete {{ p.name }}? A package already used is hidden instead.</span>
                <button type="button" class="btn-danger !px-3 !py-1 !text-sm" (click)="removeRow(p)" data-row-delete-yes>Yes, delete</button>
                <button type="button" class="btn !px-3 !py-1 !text-sm" (click)="rowDelete.set(null)">Keep</button>
              </div>
            }
          </li>
        } @empty {
          <li class="text-slate-400">No packages yet.</li>
        }
      </ul>
    </section>
  `,
})
export class Packages implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly packages = signal<Pack[]>([]);
  protected readonly types = signal<string[]>([]);
  protected readonly editingId = signal<number | null>(null);
  protected readonly busy = signal(false);
  /** the package waiting for a yes to its delete */
  protected readonly rowDelete = signal<number | null>(null);
  protected readonly formDelete = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    station_type: ['pc', [Validators.required, notBlank]],
    minutes: [60, [Validators.required, Validators.min(1), integer]],
    price: [0, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const [pk, st] = await Promise.all([
      this.sb.from('packages').select('id, name, minutes, price, station_type, active').order('station_type').order('minutes'),
      this.sb.from('stations').select('type'),
    ]);
    if (pk.error) return this.toast.error(friendlyError(pk.error));
    this.packages.set((pk.data ?? []) as Pack[]);
    const all = [...(st.data ?? []).map((s) => s.type as string), ...this.packages().map((p) => p.station_type)];
    this.types.set([...new Set(all)].sort());
  }

  protected async toggleActive(p: Pack): Promise<void> {
    const { data, error } = await this.sb.from('packages').update({ active: !p.active }).eq('id', p.id).select('id');
    if (error || !data?.length) return this.toast.error(error ? friendlyError(error) : 'Not allowed');
    this.toast.success(`${p.name} is now ${p.active ? 'inactive' : 'active'}`);
    await this.load();
  }

  /** A package never used is removed for good; one already used on a bill or session is only hidden. */
  protected async removeRow(p: Pack): Promise<void> {
    const del = await this.sb.from('packages').delete().eq('id', p.id).select('id');
    this.rowDelete.set(null);
    if (!del.error && del.data?.length) {
      this.toast.success('Package deleted');
    } else if (del.error?.code === '23503') {
      const hide = await this.sb.from('packages').update({ active: false }).eq('id', p.id).select('id');
      if (hide.error || !hide.data?.length) return this.toast.error(hide.error ? friendlyError(hide.error) : 'Not allowed');
      this.toast.success('This package has been used, so it was hidden instead of deleted');
    } else {
      return this.toast.error(del.error ? friendlyError(del.error) : 'Not allowed');
    }
    await this.load();
  }

  protected async removeFromForm(): Promise<void> {
    const p = this.packages().find((x) => x.id === this.editingId());
    this.formDelete.set(false);
    if (!p) return;
    await this.removeRow(p);
    this.cancel();
  }

  protected startNew(): void {
    this.form.reset({ name: '', station_type: 'pc', minutes: 60, price: 0, active: true });
    this.editingId.set(0);
    scrollToForm();
  }

  protected edit(p: Pack): void {
    this.form.reset({
      name: p.name,
      station_type: p.station_type,
      minutes: p.minutes,
      price: Number(p.price),
      active: p.active,
    });
    this.editingId.set(p.id);
    scrollToForm();
  }

  protected cancel(): void {
    this.formDelete.set(false);
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
      station_type: v.station_type.trim().toLowerCase(),
      minutes: Number(v.minutes),
      price: Number(v.price),
      active: v.active,
    };
    const id = this.editingId();
    this.busy.set(true);
    const result =
      id === 0
        ? await this.sb.from('packages').insert(row).select('id')
        : await this.sb.from('packages').update(row).eq('id', id).select('id');
    this.busy.set(false);
    if (result.error) return this.toast.error(friendlyError(result.error));
    if (!result.data?.length) return this.toast.error('Not allowed');
    this.toast.success(id === 0 ? 'Package added' : 'Package saved');
    this.editingId.set(null);
    await this.load();
  }
}
