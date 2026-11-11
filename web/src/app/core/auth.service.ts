import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { homeFor, Profile, Role } from './models';

export interface CustomerRecord {
  id: number;
  name: string;
  phone: string | null;
}

export const ACCOUNT_DISABLED = 'Account disabled – contact Admin';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  /** The customer's booking profile (name and phone); null until they save it. */
  readonly customer = signal<CustomerRecord | null>(null);
  /** Message shown on the login pages (e.g. account disabled). */
  readonly notice = signal<string | null>(null);

  readonly role = computed<Role | null>(() => this.profile()?.role ?? null);
  readonly home = computed(() => homeFor(this.role()));
  readonly isStaff = computed(() => this.role() === 'admin' || this.role() === 'staff');

  readonly homeFor = homeFor;

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.init();
  }

  /** Resolves once the stored session (if any) has been restored. Guards await this. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    const { data } = await this.sb.auth.getSession();
    await this.apply(data.session);
    // Do not call Supabase from inside this callback (auth lock): defer it.
    this.sb.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void this.apply(session), 0);
    });
  }

  private async apply(session: Session | null): Promise<void> {
    if (!session) {
      this.session.set(null);
      this.profile.set(null);
      this.customer.set(null);
      return;
    }
    const { data } = await this.sb
      .from('profiles')
      .select('id, email, full_name, phone, role, active')
      .eq('id', session.user.id)
      .maybeSingle();
    const profile = (data as Profile | null) ?? null;

    if (!profile || !profile.active) {
      this.notice.set(ACCOUNT_DISABLED);
      this.session.set(null);
      this.profile.set(null);
      await this.sb.auth.signOut();
      return;
    }
    this.session.set(session);
    this.profile.set(profile);
    await this.refreshCustomer();
  }

  /** Loads the signed-in customer's own record (null for staff or before the profile is saved). */
  async refreshCustomer(): Promise<void> {
    const p = this.profile();
    if (!p || p.role !== 'customer') {
      this.customer.set(null);
      return;
    }
    const { data } = await this.sb.from('customers').select('id, name, phone').eq('profile_id', p.id).maybeSingle();
    this.customer.set((data as CustomerRecord | null) ?? null);
  }

  /** Admin / staff login. Throws an Error with a user-friendly message. */
  async signInWithPassword(email: string, password: string): Promise<Profile> {
    this.notice.set(null);
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
    }
    await this.apply(data.session);
    const p = this.profile();
    if (!p) throw new Error(this.notice() ?? ACCOUNT_DISABLED);
    if (p.role === 'customer') {
      await this.signOut();
      throw new Error('This login is for staff. Customers sign in from the Book page.');
    }
    return p;
  }

  /** Customer login step 1: send a 6-digit code to the email. */
  async requestOtp(email: string): Promise<void> {
    this.notice.set(null);
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw new Error(error.message);
  }

  /** Customer login step 2: verify the code. */
  async verifyOtp(email: string, token: string): Promise<Profile> {
    const { data, error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error('That code is wrong or has expired');
    await this.apply(data.session);
    const p = this.profile();
    if (!p) throw new Error(this.notice() ?? ACCOUNT_DISABLED);
    return p;
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
    this.customer.set(null);
  }
}
