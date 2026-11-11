import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Fails for a string that is only spaces. Combine with Validators.required. */
export const notBlank: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.length > 0 && c.value.trim() === '' ? { notBlank: true } : null;

/** Whole numbers only (empty is left to Validators.required). */
export const integer: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = c.value;
  if (v === null || v === undefined || v === '') return null;
  return Number.isInteger(Number(v)) ? null : { integer: true };
};

/** Money amounts have at most two decimals (empty is left to Validators.required). */
export const twoDecimals: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = c.value;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? null : { twoDecimals: true };
};

/** Optional UPI ID such as shop@okbank. */
export const upiId: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = typeof c.value === 'string' ? c.value.trim() : '';
  return v === '' || /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v) ? null : { upi: true };
};

/** Optional phone number: digits, spaces and a leading +, 7 to 15 digits. */
export const phone: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = typeof c.value === 'string' ? c.value.trim() : '';
  if (v === '') return null;
  const digits = v.replace(/\D/g, '').length;
  return /^\+?[0-9 ]+$/.test(v) && digits >= 7 && digits <= 15 ? null : { phone: true };
};

/** Group validator for an opening-hours row: open must be before close unless closed. */
export const openBeforeClose: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const v = g.value as { open_time?: string; close_time?: string; closed?: boolean };
  if (v.closed) return null;
  return v.open_time && v.close_time && v.open_time < v.close_time ? null : { timeRange: true };
};

/** Group validator: max slots must not be below min slots. */
export const maxAtLeastMin: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const v = g.value as { min_slots?: number | null; max_slots?: number | null };
  if (v.min_slots == null || v.max_slots == null) return null;
  return Number(v.max_slots) >= Number(v.min_slots) ? null : { slotRange: true };
};
