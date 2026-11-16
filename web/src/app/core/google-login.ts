import { Role } from './models';

/**
 * Google sign-in for customers. Pure helpers (no browser objects), so the rules can be unit tested.
 * The flow: the customer taps "Continue with Google" -> Supabase sends them to Google -> Google sends them back to
 * /book/login with a session. Because the page is reloaded on the way back, the page they wanted to reach
 * (`next`) is kept in the browser's session storage in between.
 */

export const GOOGLE_PENDING_KEY = 'google-login-pending';
const MAX_WAIT_MS = 10 * 60_000;

/** Where Google sends the customer back to. Must be allowed in Supabase > Authentication > URL Configuration. */
export function googleRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/book/login`;
}

export interface PendingGoogle {
  next: string | null;
}

/** Notes that a Google sign-in has started, and where to go afterwards. Never throws (storage may be blocked). */
export function rememberPending(storage: Pick<Storage, 'setItem'> | null | undefined, next: string | null, now: number): void {
  try {
    storage?.setItem(GOOGLE_PENDING_KEY, JSON.stringify({ next, at: now }));
  } catch {
    /* without storage the customer simply lands on My bookings afterwards */
  }
}

/** Reads and clears the note. Null when there is none, when it is older than 10 minutes, or when it is unreadable. */
export function takePending(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number): PendingGoogle | null {
  try {
    const raw = storage?.getItem(GOOGLE_PENDING_KEY);
    if (!raw) return null;
    storage?.removeItem(GOOGLE_PENDING_KEY);
    const v = JSON.parse(raw) as { next?: unknown; at?: unknown };
    if (typeof v.at !== 'number' || now - v.at > MAX_WAIT_MS || now < v.at - 60_000) return null;
    return { next: typeof v.next === 'string' ? v.next : null };
  } catch {
    return null;
  }
}

/**
 * A message when Google (or Supabase) sent the customer back with an error, e.g. they pressed Cancel:
 * "#error=access_denied&error_description=..." or "?error=...". Null when there is no error.
 */
export function oauthErrorFrom(url: { hash?: string; search?: string }): string | null {
  const parts = [url.hash ?? '', url.search ?? ''].map((s) => new URLSearchParams(s.replace(/^[#?]/, '')));
  const error = parts.map((p) => p.get('error')).find(Boolean);
  const code = parts.map((p) => p.get('error_code')).find(Boolean);
  const description = parts.map((p) => p.get('error_description')).find(Boolean);
  if (!error && !code && !description) return null;
  if (error === 'access_denied' || /denied|cancel/i.test(description ?? '')) return 'Google sign-in was cancelled. You can try again.';
  return 'Google sign-in did not work. Please try again, or use an email code instead.';
}

export type AfterLogin = { kind: 'url'; url: string } | { kind: 'profile'; next: string };

/**
 * Where to go once a customer is signed in (by Google or by an email code):
 * staff and admins go to their own area; a customer who has not saved a name and phone yet is asked for them first
 * (and then continues to `next`); otherwise they go to `next`, or to their bookings.
 */
export function afterLoginPath(
  who: { role: Role; hasCustomer: boolean },
  next: string | null,
  homeFor: (role: Role) => string,
): AfterLogin {
  if (who.role !== 'customer') return { kind: 'url', url: homeFor(who.role) };
  if (!who.hasCustomer) return { kind: 'profile', next: next ?? '/book' };
  return { kind: 'url', url: next ?? '/book/my-bookings' };
}
