import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { FieldError } from '../../shared/field-error';
import { ToastService } from '../../shared/toast.service';
import { integer, notBlank, upiId } from '../../shared/validators';

@Component({
  selector: 'app-shop-settings',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="p-4">
      <h1 class="text-xl font-semibold">Shop &amp; receipt</h1>
      @if (!loaded()) {
        <p class="mt-3 text-slate-400">Loading…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" class="mt-4 max-w-xl space-y-4">
          <div class="card space-y-3">
            <h2 class="font-medium">Shop details</h2>
            <label class="label">Shop name
              <input formControlName="shop_name" class="field" />
              <app-field-error [control]="form.controls.shop_name" />
            </label>
            <label class="label">Address
              <textarea formControlName="address" rows="2" class="field"></textarea>
            </label>
            <label class="label">Phone
              <input formControlName="phone" inputmode="tel" class="field" />
            </label>
            <label class="label">GSTIN (optional, printed on receipts)
              <input formControlName="gstin" class="field" />
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">UPI</h2>
            <label class="label">UPI ID
              <input formControlName="upi_id" placeholder="shop@okbank" class="field" />
              <app-field-error [control]="form.controls.upi_id" />
            </label>
            <label class="label">Payee name shown in the UPI app
              <input formControlName="upi_payee_name" class="field" />
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Receipt</h2>
            <label class="label">Paper width
              <select formControlName="receipt_width" class="field">
                <option [ngValue]="58">58 mm</option>
                <option [ngValue]="80">80 mm</option>
              </select>
            </label>
            <label class="label">Footer text
              <input formControlName="receipt_footer" class="field" />
            </label>
          </div>

          <div class="card space-y-3">
            <h2 class="font-medium">Billing rules</h2>
            <label class="label">Billing block (minutes) – played time rounds up to this
              <input formControlName="billing_block_min" type="number" inputmode="numeric" class="field" />
              <app-field-error [control]="form.controls.billing_block_min" />
            </label>
            <label class="label">Minimum bill (minutes) for per-hour sessions
              <input formControlName="min_bill_min" type="number" inputmode="numeric" class="field" />
              <app-field-error [control]="form.controls.min_bill_min" />
            </label>
            <p class="text-xs text-slate-400">Running sessions keep the values they started with.</p>
          </div>

          <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        </form>
      }
    </section>
  `,
})
export class ShopSettings implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    shop_name: ['', [Validators.required, notBlank]],
    address: [''],
    phone: [''],
    gstin: [''],
    upi_id: ['', [upiId]],
    upi_payee_name: [''],
    receipt_width: [80],
    receipt_footer: [''],
    billing_block_min: [15, [Validators.required, Validators.min(1), integer]],
    min_bill_min: [30, [Validators.required, Validators.min(0), integer]],
  });

  async ngOnInit(): Promise<void> {
    const { data, error } = await this.sb.from('settings').select('*').maybeSingle();
    if (error) {
      this.toast.error(friendlyError(error));
      return;
    }
    if (data) {
      this.form.patchValue({
        shop_name: data.shop_name ?? '',
        address: data.address ?? '',
        phone: data.phone ?? '',
        gstin: data.gstin ?? '',
        upi_id: data.upi_id ?? '',
        upi_payee_name: data.upi_payee_name ?? '',
        receipt_width: data.receipt_width,
        receipt_footer: data.receipt_footer ?? '',
        billing_block_min: data.billing_block_min,
        min_bill_min: data.min_bill_min,
      });
    }
    this.loaded.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const blank = (s: string) => (s.trim() === '' ? null : s.trim());
    this.busy.set(true);
    const { data, error } = await this.sb
      .from('settings')
      .update({
        shop_name: v.shop_name.trim(),
        address: blank(v.address),
        phone: blank(v.phone),
        gstin: blank(v.gstin),
        upi_id: blank(v.upi_id),
        upi_payee_name: blank(v.upi_payee_name),
        receipt_width: Number(v.receipt_width),
        receipt_footer: v.receipt_footer.trim(),
        billing_block_min: Number(v.billing_block_min),
        min_bill_min: Number(v.min_bill_min),
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
      .select('id');
    this.busy.set(false);
    if (error) return this.toast.error(friendlyError(error));
    if (!data?.length) return this.toast.error('Not allowed');
    this.form.markAsPristine();
    this.toast.success('Settings saved');
  }
}
