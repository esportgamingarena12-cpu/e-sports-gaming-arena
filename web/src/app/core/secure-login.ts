import { SupabaseClient } from '@supabase/supabase-js';

/** What the secure-login function sends back on a successful password login. */
export interface LoginTokens {
  access_token: string;
  refresh_token: string;
}

const GENERIC = 'Sign in did not work. Please try again.';

/**
 * The plain message for a failed secure-login answer. Wrong password and unknown email read the same on purpose,
 * so nothing reveals whether an email has an account.
 */
export function loginFailureText(status: number, body: { error?: string; code?: string } | null): string {
  if (status === 429) return body?.error || 'Too many attempts. Please try again in 15 minutes.';
  if (status === 401) return 'Wrong email or password';
  if (body?.code === 'captcha') return 'Please complete the security check and try again.';
  if (body?.code === 'email_not_confirmed') return 'Please confirm your email first, then sign in. Or use Google.';
  return GENERIC;
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
      throw new Error(loginFailureText(ctx.status, body));
    }
    // no answer at all: the network
    throw new Error('No connection. Check your internet and try again.');
  }
  if (req.verifyOnly) return null;
  const t = data as Partial<LoginTokens> | null;
  if (!t?.access_token || !t.refresh_token) throw new Error(GENERIC);
  return { access_token: t.access_token, refresh_token: t.refresh_token };
}
