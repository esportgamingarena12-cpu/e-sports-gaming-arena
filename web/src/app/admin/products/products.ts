import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank } from '../../shared/validators';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  stock_qty: number;
  low_stock_level: number;
  track_stock: boolean;
  active: boolean;
}

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Products</h1>
        <button type="button" class="btn-primary" (click)="startNew()">+ Product</button>
      </div>

      @if (editingId() !== null) {
        <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 max-w-xl space-y-3">
          <h2 class="font-medium">{{ editingId() === 0 ? 'New product' : 'Edit product' }}</h2>
          <label class="label">Name
            <input formControlName="name" class="field" />
            <app-field-error [control]="form.controls.name" />
          </label>
          <label class="label">Category
            <input formControlName="category" list="product-categories" class="field" />
            <app-field-error [control]="form.controls.category" />
          </label>
          <datalist id="product-categories">
            @for (c of categories(); track c) { <option [value]="c"></option> }
          </datalist>
          <label class="label">Price (₹)
            <input formControlName="price" type="number" inputmode="decimal" step="0.01" class="field" />
            <app-field-error [control]="form.controls.price" />
          </label>
          <label class="label">Low-stock alert level
            <input formControlName="low_stock_level" type="number" inputmode="numeric" class="field" />
            <app-field-error [control]="form.controls.low_stock_level" />
          </label>
          @if (editingId() === 0) {
            <label class="label">Opening stock
              <input formControlName="opening_stock" type="number" inputmode="numeric" class="field" />
              <app-field-error [control]="form.controls.opening_stock" />
            </label>
          } @else {
            <p class="text-xs text-slate-400">Change stock from the Stock screen at the counter (purchase, wastage, adjustment).</p>
          }
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="track_stock" /> Track stock
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="active" /> Active (shown in the canteen)
          </label>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn" (click)="cancel()">Cancel</button>
          </div>
        </form>
      }

      <ul class="mt-4 space-y-2">
        @for (p of products(); track p.id) {
          <li class="card flex items-center gap-3" [class.opacity-60]="!p.active">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ p.name }}</p>
              <p class="text-sm text-slate-400">
                {{ p.category }} · ₹{{ p.price }}
                @if (p.track_stock) {
                  · stock <span [class]="p.stock_qty <= p.low_stock_level ? 'font-semibold text-amber-400' : ''">{{ p.stock_qty }}</span>
                  (alert at {{ p.low_stock_level }})
                } @else { · not tracked }
                @if (!p.active) { · inactive }
              </p>
            </div>
            <button type="button" class="btn" (click)="edit(p)">Edit</button>
          </li>
        } @empty {
          <li class="text-slate-400">No products yet.</li>
        }
      </ul>
    </section>
  `,
})
export class Products implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = computed(() => [...new Set(this.products().map((p) => p.category))].sort());
  protected readonly editingId = signal<number | null>(null);
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    category: ['General', [Validators.required, notBlank]],
    price: [0, [Validators.required, Validators.min(0)]],
    low_stock_level: [0, [Validators.required, Validators.min(0), integer]],
    opening_stock: [0, [Validators.required, Validators.min(0), integer]],
    track_stock: [true],
    active: [true],
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const { data, error } = await this.sb
      .from('products')
      .select('id, name, category, price, stock_qty, low_stock_level, track_stock, active')
      .order('category')
      .order('name');
    if (error) return this.toast.error(friendlyError(error));
    this.products.set((data ?? []) as Product[]);
  }

  protected startNew(): void {
    this.form.reset({ name: '', category: 'General', price: 0, low_stock_level: 0, opening_stock: 0, track_stock: true, active: true });
    this.editingId.set(0);
  }

  protected edit(p: Product): void {
    this.form.reset({
      name: p.name,
      category: p.category,
      price: Number(p.price),
      low_stock_level: p.low_stock_level,
      opening_stock: 0,
      track_stock: p.track_stock,
      active: p.active,
    });
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
    const row = {
      name: v.name.trim(),
      category: v.category.trim(),
      price: Number(v.price),
      low_stock_level: Number(v.low_stock_level),
      track_stock: v.track_stock,
      active: v.active,
    };
    const id = this.editingId();
    this.busy.set(true);

    if (id === 0) {
      const created = await this.sb.from('products').insert(row).select('id').single();
      if (created.error || !created.data) {
        this.busy.set(false);
        return this.toast.error(friendlyError(created.error));
      }
      const opening = Number(v.opening_stock);
      if (opening > 0 && v.track_stock) {
        // Stock only changes through the stock_move function.
        const moved = await this.sb.rpc('stock_move', {
          p_product: created.data.id,
          p_qty: opening,
          p_reason: 'purchase',
          p_note: 'Opening stock',
        });
        if (moved.error) {
          this.busy.set(false);
          this.toast.error(`Product saved, but opening stock failed: ${friendlyError(moved.error)}`);
          this.editingId.set(null);
          await this.load();
          return;
        }
      }
      this.busy.set(false);
      this.toast.success('Product added');
    } else {
      const updated = await this.sb.from('products').update(row).eq('id', id).select('id');
      this.busy.set(false);
      if (updated.error) return this.toast.error(friendlyError(updated.error));
      if (!updated.data?.length) return this.toast.error('Not allowed');
      this.toast.success('Product saved');
    }
    this.editingId.set(null);
    await this.load();
  }
}
