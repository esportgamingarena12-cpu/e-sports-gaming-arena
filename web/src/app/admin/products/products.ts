import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import {
  extensionFor,
  FOOD_BUCKET,
  FOOD_IMAGE_TYPES,
  foodImagePath,
  FoodPic,
  shrinkImage,
  validateFoodImage,
} from '../../shared/food-image';
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
  featured: boolean;
  image_path: string | null;
}

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, FieldError, FoodPic],
  template: `
    <section class="p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Products</h1>
        <button type="button" class="btn-primary" (click)="startNew()" data-new>+ Product</button>
      </div>

      @if (editingId() !== null) {
        <form [formGroup]="form" (ngSubmit)="save()" class="card mt-4 max-w-xl space-y-3" data-form>
          <h2 class="font-medium">{{ editingId() === 0 ? 'New product' : 'Edit product' }}</h2>

          <div class="flex items-center gap-3" data-photo>
            @if (preview(); as u) {
              <img [src]="u" alt="New photo" class="size-24 shrink-0 rounded-lg object-cover" data-preview />
            } @else if (!removeImage()) {
              <app-food-pic class="size-24 shrink-0 rounded-lg" [path]="currentPath()" [name]="form.controls.name.value" />
            } @else {
              <app-food-pic class="size-24 shrink-0 rounded-lg" [path]="null" [name]="form.controls.name.value" />
            }
            <div class="min-w-0 space-y-1.5">
              <label class="btn-outline inline-flex cursor-pointer items-center">
                {{ preview() || (currentPath() && !removeImage()) ? 'Change photo' : 'Add photo' }}
                <input type="file" class="sr-only" [accept]="accept" (change)="pick($event)" data-file />
              </label>
              @if (preview() || (currentPath() && !removeImage())) {
                <button type="button" class="btn ml-2 text-red-300" (click)="clearPhoto()" data-remove-photo>Remove photo</button>
              }
              <p class="text-xs text-slate-400">JPG, PNG or WebP. Large phone photos are made smaller automatically.</p>
              @if (photoError()) { <p class="text-xs text-red-400" role="alert" data-photo-error>{{ photoError() }}</p> }
            </div>
          </div>

          <label class="label">Name
            <input formControlName="name" class="field" data-name />
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
            <input formControlName="price" type="number" inputmode="decimal" step="0.01" class="field" data-price />
            <app-field-error [control]="form.controls.price" />
          </label>
          <label class="label">Low-stock alert level
            <input formControlName="low_stock_level" type="number" inputmode="numeric" class="field" />
            <app-field-error [control]="form.controls.low_stock_level" />
          </label>
          @if (editingId() === 0) {
            <label class="label">Opening stock
              <input formControlName="opening_stock" type="number" inputmode="numeric" class="field" data-opening />
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
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" formControlName="featured" data-featured /> Show on the home page (up to 6 items are highlighted, featured ones first)
          </label>

          @if (confirmDelete()) {
            <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm" data-delete-confirm>
              <p>Delete <b>{{ form.controls.name.value }}</b>? An item that was never sold is removed for good. One that has been sold is only hidden, so old bills stay correct.</p>
              <div class="mt-2 flex gap-2">
                <button type="button" class="btn-danger" [disabled]="busy()" (click)="remove()" data-delete-yes>Yes, delete</button>
                <button type="button" class="btn" (click)="confirmDelete.set(false)">Keep</button>
              </div>
            </div>
          }

          <div class="flex flex-wrap gap-2">
            <button type="submit" class="btn-primary" [disabled]="busy()" data-save>{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn" (click)="cancel()">Cancel</button>
            @if (editingId() !== 0 && !confirmDelete()) {
              <button type="button" class="btn ml-auto text-red-300" (click)="confirmDelete.set(true)" data-delete>Delete</button>
            }
          </div>
        </form>
      }

      <ul class="mt-4 space-y-2" data-list>
        @for (p of products(); track p.id) {
          <li class="card flex items-center gap-3" [class.opacity-60]="!p.active" [attr.data-product]="p.name">
            <app-food-pic class="size-14 shrink-0 rounded-lg" [path]="p.image_path" [name]="p.name" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ p.name }}</p>
              <p class="text-sm text-slate-400">
                {{ p.category }} · ₹{{ p.price }}
                @if (p.track_stock) {
                  · stock <span [class]="p.stock_qty <= p.low_stock_level ? 'font-semibold text-amber-400' : ''">{{ p.stock_qty }}</span>
                  (alert at {{ p.low_stock_level }})
                } @else { · not tracked }
                @if (!p.active) { · inactive }
                @if (p.featured) { · <span class="text-fuchsia-300">on home page</span> }
              </p>
            </div>
            <button type="button" class="btn" (click)="edit(p)" data-edit>Edit</button>
          </li>
        } @empty {
          <li class="text-slate-400">No products yet.</li>
        }
      </ul>
    </section>
  `,
})
export class Products implements OnInit, OnDestroy {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly accept = FOOD_IMAGE_TYPES.join(',');
  protected readonly products = signal<Product[]>([]);
  protected readonly categories = computed(() => [...new Set(this.products().map((p) => p.category))].sort());
  protected readonly editingId = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);

  /** the photo already saved for the product being edited */
  protected readonly currentPath = signal<string | null>(null);
  /** a newly chosen photo (already made small) and its preview address */
  private pending: { blob: Blob; type: string } | null = null;
  protected readonly preview = signal<string | null>(null);
  protected readonly removeImage = signal(false);
  protected readonly photoError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlank]],
    category: ['General', [Validators.required, notBlank]],
    price: [0, [Validators.required, Validators.min(0)]],
    low_stock_level: [0, [Validators.required, Validators.min(0), integer]],
    opening_stock: [0, [Validators.required, Validators.min(0), integer]],
    track_stock: [true],
    active: [true],
    featured: [false],
  });

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.dropPreview();
  }

  private async load(): Promise<void> {
    const { data, error } = await this.sb
      .from('products')
      .select('id, name, category, price, stock_qty, low_stock_level, track_stock, active, featured, image_path')
      .order('category')
      .order('name');
    if (error) return this.toast.error(friendlyError(error));
    this.products.set((data ?? []) as Product[]);
  }

  private resetPhoto(path: string | null): void {
    this.dropPreview();
    this.pending = null;
    this.currentPath.set(path);
    this.removeImage.set(false);
    this.photoError.set(null);
    this.confirmDelete.set(false);
  }

  private dropPreview(): void {
    const u = this.preview();
    if (u) URL.revokeObjectURL(u);
    this.preview.set(null);
  }

  protected startNew(): void {
    this.form.reset({ name: '', category: 'General', price: 0, low_stock_level: 0, opening_stock: 0, track_stock: true, active: true, featured: false });
    this.resetPhoto(null);
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
      featured: p.featured,
    });
    this.resetPhoto(p.image_path);
    this.editingId.set(p.id);
  }

  protected cancel(): void {
    this.resetPhoto(null);
    this.editingId.set(null);
  }

  /** A photo was chosen: check it, make it small, show a preview. Nothing is uploaded until Save. */
  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoError.set(null);
    if (!FOOD_IMAGE_TYPES.includes(file.type)) {
      this.photoError.set(validateFoodImage(file));
      return;
    }
    let blob: Blob = file;
    try {
      blob = await shrinkImage(file);
    } catch {
      blob = file; // the browser could not resize it: use the original if it is small enough
    }
    const problem = validateFoodImage({ type: blob.type || file.type, size: blob.size });
    if (problem) {
      this.photoError.set(problem);
      return;
    }
    this.dropPreview();
    this.pending = { blob, type: blob.type || file.type };
    this.preview.set(URL.createObjectURL(blob));
    this.removeImage.set(false);
  }

  protected clearPhoto(): void {
    this.dropPreview();
    this.pending = null;
    this.removeImage.set(true);
    this.photoError.set(null);
  }

  private async deleteFile(path: string | null): Promise<void> {
    if (!path) return;
    // Best effort: a leftover file is harmless, so a failure here is not shown.
    await this.sb.storage.from(FOOD_BUCKET).remove([path]);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const id = this.editingId();
    const oldPath = id === 0 ? null : this.currentPath();
    this.busy.set(true);

    // 1. photo first, so the product row can point at it
    let imagePath: string | null = this.removeImage() ? null : oldPath;
    let uploaded: string | null = null;
    if (this.pending) {
      const path = foodImagePath(v.name, extensionFor(this.pending.type));
      const up = await this.sb.storage.from(FOOD_BUCKET).upload(path, this.pending.blob, {
        contentType: this.pending.type,
        upsert: false,
      });
      if (up.error) {
        this.busy.set(false);
        return this.toast.error(`The photo could not be saved: ${friendlyError(up.error)}`);
      }
      uploaded = path;
      imagePath = path;
    }

    const row = {
      name: v.name.trim(),
      category: v.category.trim(),
      price: Number(v.price),
      low_stock_level: Number(v.low_stock_level),
      track_stock: v.track_stock,
      active: v.active,
      featured: v.featured,
      image_path: imagePath,
    };

    if (id === 0) {
      const created = await this.sb.from('products').insert(row).select('id').single();
      if (created.error || !created.data) {
        this.busy.set(false);
        await this.deleteFile(uploaded);
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
          this.cancel();
          await this.load();
          return;
        }
      }
      this.busy.set(false);
      this.toast.success('Product added');
    } else {
      const updated = await this.sb.from('products').update(row).eq('id', id).select('id');
      this.busy.set(false);
      if (updated.error || !updated.data?.length) {
        await this.deleteFile(uploaded);
        return this.toast.error(updated.error ? friendlyError(updated.error) : 'Not allowed');
      }
      // the old photo is no longer used
      if (oldPath && oldPath !== imagePath) await this.deleteFile(oldPath);
      this.toast.success('Product saved');
    }
    this.cancel();
    await this.load();
  }

  /** Delete: a never-sold product is removed for good (and its photo), any other is only hidden. */
  protected async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    const photo = this.currentPath();
    this.busy.set(true);
    const { data, error } = await this.sb.rpc('delete_product', { p_product: id });
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    if (data === 'deleted') {
      await this.deleteFile(photo);
      this.toast.success('Product deleted');
    } else {
      this.toast.success('This item has sales history, so it was hidden instead of deleted');
    }
    this.cancel();
    await this.load();
  }
}
