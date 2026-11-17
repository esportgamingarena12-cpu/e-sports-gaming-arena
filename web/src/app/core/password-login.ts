/**
 * Rules for the customer's email-and-password sign up and sign in, and for "Remember me".
 * Pure functions, so they can be unit tested.
 */

export const MIN_PASSWORD = 8;
/** Passwords are cut off after 72 bytes by the way Supabase stores them, so longer ones are refused up front. */
export const MAX_PASSWORD = 72;

/** A message when the password is not acceptable, otherwise null. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use letters and at least one number';
  const e = email.trim().toLowerCase();
  if (e && (password.toLowerCase() === e || password.toLowerCase() === e.split('@')[0])) return 'The password cannot be your email';
  return null;
}

/** True when the two passwords are the same (and not empty). */
export function passwordsMatch(password: string, confirm: string): boolean {
  return password.length > 0 && password === confirm;
}

/** Plain-language message for a Supabase sign-up error. */
export function signUpError(message: string | null | undefined): string {
  const m = message ?? '';
  if (/already (registered|exists|been registered)|user_already_exists/i.test(m)) return 'That email already has an account. Sign in instead, or use Google.';
  if (/rate limit|too many|over_email_send_rate_limit/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/password/i.test(m) && /(at least|short|weak|characters|pwned)/i.test(m)) return `Choose a stronger password (at least ${MIN_PASSWORD} characters, with letters and a number).`;
  if (/signups? (are |is )?(not allowed|disabled)/i.test(m)) return 'Sign up is switched off right now. Please use Google.';
  if (/invalid.*email|unable to validate email|email_address_invalid/i.test(m)) return 'Enter a valid email address.';
  return 'Sign up did not work. Please try again.';
}

/** Plain-language message for a Supabase sign-in error. */
export function signInError(message: string | null | undefined): string {
  const m = message ?? '';
  if (/invalid login credentials|invalid_credentials/i.test(m)) return 'Wrong email or password';
  if (/email not confirmed|email_not_confirmed/i.test(m)) return 'Please confirm your email first, then sign in. Or use Google.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  return 'Sign in did not work. Please try again.';
}

// ---------- remember me ----------
/** Saved in the browser for good: "1" = stay signed in, "0" = sign out when the browser is closed. */
export const REMEMBER_KEY = 'remember-me';
/** Saved for this browser session only: it is gone once the browser is closed, which is how a new visit is spotted. */
export const ALIVE_KEY = 'session-alive';

/**
 * True when the stored login should be ended at start-up: the customer chose not to be remembered, and this is a
 * new browser session (the "alive" marker from the previous one is gone).
 */
export function shouldEndSession(remember: string | null | undefined, alive: string | null | undefined): boolean {
  return remember === '0' && alive !== '1';
}

// ---------- change password ----------
/** The first problem with a change-password form, or null when it can be sent. `hasPassword` = the account already has one. */
export function changePasswordProblem(current: string, next: string, confirm: string, email: string, hasPassword: boolean): string | null {
  if (hasPassword && !current) return 'Enter your current password';
  const bad = passwordProblem(next, email);
  if (bad) return bad;
  if (hasPassword && current === next) return 'The new password must be different from the current one';
  if (!passwordsMatch(next, confirm)) return 'The two new passwords do not match';
  return null;
}

/** Plain-language message for a Supabase error while changing the password. */
export function changePasswordError(message: string | null | undefined): string {
  const m = message ?? '';
  if (/same.*password|different from the old/i.test(m)) return 'The new password must be different from the current one';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/reauth|recently|nonce/i.test(m)) return 'For safety, please sign out, sign in again, and then change the password.';
  if (/password/i.test(m) && /(at least|short|weak|characters|pwned)/i.test(m)) return `Choose a stronger password (at least ${MIN_PASSWORD} characters, with letters and a number).`;
  return 'The password could not be changed. Please try again.';
}
