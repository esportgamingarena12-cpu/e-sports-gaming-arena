import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { secureLogin, warmSecureLogin } from './secure-login';
import { googleRedirectUrl, PendingGoogle, rememberPending, takePending } from './google-login';
import { consentNeeded, LEGAL_VERSION } from './legal';
import { homeFor, Profile, Role } from './models';
import { ALIVE_KEY, changePasswordError, REMEMBER_KEY, shouldEndSession, signUpError } from './password-login';

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
  /** True once the stored session (if any) has been restored; until then the top bar shows neither login nor logout. */
  readonly ready = signal(false);
  /** Message shown on the login pages (e.g. account disabled). */
  readonly notice = signal<string | null>(null);

  readonly role = computed<Role | null>(() => this.profile()?.role ?? null);
  readonly home = computed(() => homeFor(this.role()));
  /** A customer who has not yet agreed to the current Terms and Privacy Policy. */
  readonly needsConsent = computed(() => consentNeeded(this.profile()));
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
    try {
      if (shouldEndSession(localStorage.getItem(REMEMBER_KEY), sessionStorage.getItem(ALIVE_KEY))) await this.sb.auth.signOut();
      sessionStorage.setItem(ALIVE_KEY, '1');
    } catch {
      /* storage not available: the stored login is simply kept */
    }
    const { data } = await this.sb.auth.getSession();
    await this.apply(data.session);
    this.ready.set(true);
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
      .select('id, email, full_name, phone, role, active, consent_version')
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
  async signInWithPassword(email: string, password: string, captchaToken = ''): Promise<Profile> {
    this.notice.set(null);
    const session = await this.passwordSession(email, password, captchaToken);
    await this.apply(session);
    const p = this.profile();
    if (!p) throw new Error(this.notice() ?? ACCOUNT_DISABLED);
    if (p.role === 'customer') {
      await this.signOut();
      throw new Error('This login is for staff. Customers sign in from the Book page.');
    }
    return p;
  }

  /** Called when a login page opens: wakes the login function so signing in is quick. */
  warmUpLogin(): void {
    warmSecureLogin(this.sb);
  }

  /**
   * A password login through the secure-login function (it counts failures and locks the account), then the session it returns
   * is installed in this browser. Throws an Error with a plain message.
   */
  private async passwordSession(email: string, password: string, captchaToken: string): Promise<Session> {
    const tokens = await secureLogin(this.sb, { email, password, captchaToken });
    const { data, error } = await this.sb.auth.setSession({ access_token: tokens!.access_token, refresh_token: tokens!.refresh_token });
    if (error || !data.session) {
      console.warn('[sign-in] the session could not be installed:', error?.message ?? 'no session');
      throw new Error(`Sign in did not work. Please try again. (ref s-${(error?.name ?? 'nosession').replace(/[^\w-]/g, '').slice(0, 30)})`);
    }
    return data.session;
  }

  /** Saves the "Remember me" choice: unticked means the login ends when the browser is closed. */
  private setRemember(remember: boolean): void {
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    } catch {
      /* storage not available: nothing to remember */
    }
  }

  /** Customer sign in with email and password. Staff and admins who use this form are signed in too. */
  async signInCustomer(email: string, password: string, remember: boolean, captchaToken = ''): Promise<Profile> {
    this.notice.set(null);
    const session = await this.passwordSession(email, password, captchaToken);
    this.setRemember(remember);
    await this.apply(session);
    const p = this.profile();
    if (!p) throw new Error(this.notice() ?? ACCOUNT_DISABLED);
    return p;
  }

  /**
   * Customer sign up. Returns the new profile when the customer is signed in straight away, or null when Supabase
   * is set to confirm the email first (then no session exists yet and the customer must open the email).
   */
  async signUpCustomer(fullName: string, email: string, password: string, remember: boolean, captchaToken = ''): Promise<Profile | null> {
    this.notice.set(null);
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, ...(captchaToken ? { captchaToken } : {}) },
    });
    if (error) throw new Error(signUpError(error.message));
    // with email confirmation on, an address that already has an account comes back without any identity
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error(signUpError('User already registered'));
    if (!data.session) return null;
    this.setRemember(remember);
    await this.apply(data.session);
    const p = this.profile();
    if (!p) throw new Error(this.notice() ?? ACCOUNT_DISABLED);
    return p;
  }

  /**
   * Customer login with a Google account. Sends the browser to Google; Google sends the customer back to
   * /book/login signed in. `next` is the page they wanted, kept for when they return.
   * If Google sign-in has not been switched on in Supabase yet, the server answers 400 instead of redirecting:
   * then the customer gets a clear message instead of a blank error page.
   */
  async signInWithGoogle(next: string | null): Promise<void> {
    this.notice.set(null);
    const { data, error } = await this.sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: googleRedirectUrl(window.location.origin), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data.url) throw new Error('Google sign-in could not start. Please try again, or sign in with your email and password.');
    let off = false;
    try {
      off = (await fetch(data.url, { redirect: 'manual' })).status === 400;
    } catch {
      /* the check itself could not run (offline, blocked): carry on and let Google answer */
    }
    if (off) throw new Error('Google sign-in is not switched on yet. Please sign in with your email and password instead.');
    this.setRemember(true);
    rememberPending(sessionStorage, next, Date.now());
    window.location.assign(data.url);
  }

  /** On the way back from Google: the note left before leaving (and clears it), or null if this is not a Google return. */
  takeGoogleReturn(): PendingGoogle | null {
    return takePending(sessionStorage, Date.now());
  }

  /** True when this account signs in with an email and password (a Google-only account has none yet). */
  hasPassword(): boolean {
    const providers = (this.session()?.user.app_metadata?.['providers'] as string[] | undefined) ?? [];
    return providers.includes('email');
  }

  /**
   * Change the signed-in person's password (admin, staff or customer). An account that already has a password must give
   * the current one, which is checked first by signing in with it. A Google-only account can simply set one.
   * Throws an Error with a plain message.
   */
  async changePassword(current: string, next: string, captchaToken = ''): Promise<void> {
    const email = this.session()?.user.email ?? this.profile()?.email ?? '';
    if (this.hasPassword()) {
      // the current password is checked through the same counted, lockable login (nothing is signed in by this)
      try {
        await secureLogin(this.sb, { email, password: current, captchaToken, verifyOnly: true });
      } catch (e) {
        const m = (e as Error).message;
        throw new Error(m === 'Wrong email or password' ? 'The current password is wrong' : m);
      }
    }
    const { error } = await this.sb.auth.updateUser({ password: next });
    if (error) throw new Error(changePasswordError(error.message));
  }

  /** Saves that the signed-in customer agreed to the current Terms and Privacy Policy. */
  async recordConsent(): Promise<void> {
    const { error } = await this.sb.rpc('record_consent', { p_version: LEGAL_VERSION });
    if (error) throw new Error(error.message);
    const p = this.profile();
    if (p) this.profile.set({ ...p, consent_version: LEGAL_VERSION });
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
    this.customer.set(null);
  }
}
