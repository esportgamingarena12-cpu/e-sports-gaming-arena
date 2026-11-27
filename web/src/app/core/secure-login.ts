import { SupabaseClient } from '@supabase/supabase-js';

/** What the secure-login function sends back on a successful password login. */
export interface LoginTokens {
  access_token: string;
  refresh_token: string;
}

const GENERIC = 'Sign in did not work. Please try again.';

/** A failure that is only the connection (no answer, or the service in between timed out): trying again is safe and usually works. */
export class TransientLoginError extends Error {
  readonly transient = true;
}
const TRANSIENT_STATUS = new Set([408, 502, 503, 504, 546]);

/**
 * Runs a sign-in attempt; when it fails only because of the connection, runs `beforeRetry` (get a fresh security check) and tries once more.
 * Any other failure (wrong password, locked, security check) is passed on at once. A wrong password is never tried twice.
 */
export async function retryOnce<T>(run: () => Promise<T>, beforeRetry: () => Promise<void>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof TransientLoginError)) throw e;
    await beforeRetry();
    return run();
  }
}
/** The same plain message plus a short reference (the answer's status, never a password or a technical text), so a failure on one computer can be traced. */
const withRef = (ref: string): string => `${GENERIC} (ref ${ref})`;

/**
 * The plain message for a failed secure-login answer. Wrong password and unknown email read the same on purpose,
 * so nothing reveals whether an email has an account.
 */
export function loginFailureText(status: number, body: { error?: string; code?: string } | null): string {
  if (status === 429) return body?.error || 'Too many attempts. Please try again in 15 minutes.';
  if (status === 401) return 'Wrong email or password';
  if (body?.code === 'captcha') return 'Please complete the security check and try again.';
  if (body?.code === 'email_not_confirmed') return 'Please confirm your email first, then sign in. Or use Google.';
  if (TRANSIENT_STATUS.has(status)) return `The connection to the server is unstable. Please try again. (ref ${status})`;
  return withRef(`${status}${body?.code ? '-' + String(body.code).replace(/[^\w-]/g, '').slice(0, 20) : ''}`);
}

/**
 * Wakes the secure-login function while the login page is open, so the first real sign-in does not wait for it to start.
 * It sends an empty request that is refused straight away (nothing is counted or stored) and ignores the answer.
 */
export function warmSecureLogin(sb: SupabaseClient): void {
  void Promise.resolve(sb.functions.invoke('secure-login', { body: {} })).catch(() => undefined);
}

export interface LoginRequest {
  email: string;
  password: string;
  /** the Cloudflare Turnstile token ('' while the security check is not switched on) */
  captchaToken?: string;
  /** only check the password (Change password): nothing is signed in */
  verifyOnly?: boolean;
}

/**
 * Signs in with a password through the secure-login function, which counts failed attempts on the server
 * (5 wrong passwords lock the account for 15 minutes). Returns the tokens, or null when `verifyOnly`.
 * Throws an Error with a plain message.
 */
export async function secureLogin(sb: SupabaseClient, req: LoginRequest): Promise<LoginTokens | null> {
  const { data, error } = await sb.functions.invoke('secure-login', {
    body: { email: req.email, password: req.password, captcha_token: req.captchaToken ?? '', verify_only: req.verifyOnly === true },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = (await ctx.json().catch(() => null)) as { error?: string; code?: string } | null;
      console.warn('[sign-in] the login service answered', ctx.status, body?.code ?? '');
      const text = loginFailureText(ctx.status, body);
      throw TRANSIENT_STATUS.has(ctx.status) ? new TransientLoginError(text) : new Error(text);
    }
    // no answer at all: the network
    throw new TransientLoginError('No connection. Check your internet and try again.');
  }
  if (req.verifyOnly) return null;
  const t = data as Partial<LoginTokens> | null;
  if (!t?.access_token || !t.refresh_token) throw new Error(withRef('no-tokens'));
  return { access_token: t.access_token, refresh_token: t.refresh_token };
}
