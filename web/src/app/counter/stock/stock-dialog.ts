import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { integer } from '../../shared/validators';
import { Product } from '../counter.store';
import { MoveType, stockDelta } from '../stock-utils';

const LABELS: Record<MoveType, string> = { purchase: 'Stock in', wastage: 'Wastage', adjust: 'Adjustment' };

/** Purchase and wastage need a positive quantity; an adjustment any non-zero change; notes are required for the last two. */
function moveRules(g: AbstractControl): ValidationErrors | null {
  const { type, qty, note } = g.value as { type: MoveType; qty: number | null; note: string };
  const errors: ValidationErrors = {};
  if (qty === null || qty === undefined || Number.isNaN(Number(qty))) return null; // required handles it
  if (type !== 'adjust' && Number(qty) <= 0) errors['qtyPositive'] = true;
  if (type === 'adjust' && Number(qty) === 0) errors['qtyZero'] = true;
  if (type !== 'purchase' && (note ?? '').trim() === '') errors['noteRequired'] = true;
  return Object.keys(errors).length ? errors : null;
}

/** Stock in / wastage / adjustment for one product, through the stock_move function. */
@Component({
  selector: 'app-stock-dialog',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
         role="dialog" aria-modal="true" [attr.aria-label]="'Stock for ' + product().name">
      <form [formGroup]="form" (ngSubmit)="submit()"
            class="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-t-lg bg-slate-900 p-4 sm:rounded-lg">
        <h2 class="text-lg font-semibold">{{ product().name }}</h2>
        <p class="text-sm text-slate-400">Current stock: {{ product().stock_qty }}</p>

        <fieldset class="flex flex-wrap gap-2">
          <legend class="label">What happened?</legend>
          @for (t of types; track t) {
            <label class="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-sm">
              <input type="radio" formControlName="type" [value]="t" /> {{ labels[t] }}
            </label>
          }
        </fieldset>

        <label class="label">
          {{ form.controls.type.value === 'adjust' ? 'Change (use − to remove)' : 'Quantity' }}
          <input formControlName="qty" type="number" inputmode="numeric" class="field" />
          <app-field-error [control]="form.controls.qty" />
        </label>
        @if (form.errors?.['qtyPositive']) { <p class="-mt-2 text-xs text-red-400" role="alert">Enter a quantity above 0</p> }
        @if (form.errors?.['qtyZero']) { <p class="-mt-2 text-xs text-red-400" role="alert">A change of 0 does nothing</p> }

        <label class="label">
          Note {{ form.controls.type.value === 'purchase' ? '(vendor, optional)' : '(required)' }}
          <input formControlName="note" autocomplete="off" class="field" />
        </label>
        @if (form.errors?.['noteRequired']) { <p class="-mt-2 text-xs text-red-400" role="alert">A note is required</p> }

        @if (preview() !== null) {
          <p class="text-sm" [class]="preview()! < 0 ? 'text-red-400' : 'text-slate-300'" data-preview>
            Stock: {{ product().stock_qty }} → {{ preview() }}{{ preview()! < 0 ? ' (not enough stock)' : '' }}
          </p>
        }
        @if (error()) { <p class="text-sm text-red-400" role="alert">{{ error() }}</p> }

        <div class="flex gap-2">
          <button type="submit" class="btn-primary flex-1" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        </div>
      </form>
    </div>
  `,
})
export class StockDialog implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);

  readonly product = input.required<Product>();
  readonly initialType = input<MoveType>('purchase');
  readonly saved = output<void>();
  readonly closed = output<void>();

  protected readonly types: MoveType[] = ['purchase', 'wastage', 'adjust'];
  protected readonly labels = LABELS;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group(
    {
      type: this.fb.nonNullable.control<MoveType>('purchase'),
      qty: this.fb.control<number | null>(null, [Validators.required, integer]),
      note: this.fb.nonNullable.control(''),
    },
    { validators: moveRules },
  );

  private readonly value = signal(this.form.getRawValue());
  protected readonly preview = computed(() => {
    const v = this.value();
    if (v.qty === null || v.qty === undefined || Number.isNaN(Number(v.qty)) || Number(v.qty) === 0) return null;
    return this.product().stock_qty + stockDelta(v.type, Number(v.qty));
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.value.set(this.form.getRawValue()));
  }

  ngOnInit(): void {
    this.form.controls.type.setValue(this.initialType());
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (this.preview() !== null && this.preview()! < 0) return;
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.sb.rpc('stock_move', {
      p_product: this.product().id,
      p_qty: Number(v.qty),
      p_reason: v.type,
      p_note: v.note.trim() || null,
    });
    this.busy.set(false);
    if (error) {
      this.error.set(friendlyError(error));
      return;
    }
    this.saved.emit();
    this.closed.emit();
  }
}
