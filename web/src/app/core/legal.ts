import { inject, Injectable } from '@angular/core';
import { Role } from './models';
import { SupabaseService } from './supabase.service';

/**
 * The version of the Terms and Privacy Policy wording (a date, YYYY-MM-DD).
 * Change it whenever the wording changes in a way customers must agree to again: every customer is then asked once more.
 */
export const LEGAL_VERSION = '2026-11-23';

/** What the public pages print about the shop. Set by the Admin in Settings; any field can be empty. */
export interface LegalInfo {
  shop_name: string | null;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  grievance_name: string | null;
  grievance_email: string | null;
  grievance_phone: string | null;
  refund_days: number;
  record_years: number;
  /** how many hours before the start a customer can still cancel online */
  cutoff_hours: number | null;
}

/** A customer must agree (again) when they never agreed, or agreed to older wording. Staff and admins do not agree here. */
export function consentNeeded(p: { role: Role; consent_version?: string | null } | null): boolean {
  return !!p && p.role === 'customer' && p.consent_version !== LEGAL_VERSION;
}

/** "2026-11-23" -> "23 November 2026". */
export function legalDate(version: string): string {
  const d = new Date(`${version}T12:00:00+05:30`);
  return isNaN(d.getTime()) ? version : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly sb = inject(SupabaseService).client;

  async info(): Promise<LegalInfo> {
    const { data, error } = await this.sb.rpc('legal_info');
    if (error) throw new Error(error.message);
    return data as LegalInfo;
  }
}
