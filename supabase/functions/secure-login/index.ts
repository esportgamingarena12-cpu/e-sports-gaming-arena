// secure-login: every password login goes through here, so failed attempts can be counted on the server.
//   - 5 wrong passwords for one account within 15 minutes lock that account for 15 minutes
//   - 20 wrong passwords from one internet address within 15 minutes lock that address for 15 minutes
//   - a correct password clears the account's count
//   - wrong password, unknown email and a locked account give the same plain answers, so nothing reveals whether an email exists
//   - the Cloudflare Turnstile token (when Supabase's CAPTCHA protection is on) is passed on to Supabase, which checks it
// The password is only passed to Supabase's own login. It is never stored, logged or returned.
// Secrets used (set by Supabase for every function): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Supabase's edge runtime can finish small jobs after the answer has been sent (so the person does not wait for them).
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const inBackground = (p: Promise<unknown>) => {
  const safe = p.catch(() => undefined);
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(safe);
};

const ALLOWED_ORIGINS = ['https://e-sports-gaming-arena.pages.dev', 'http://localhost:4200', 'http://127.0.0.1:4200'];
const WINDOW_MINUTES = 15;
const ACCOUNT_MAX = 5;
const IP_MAX = 20;

const corsFor = (req: Request): Record<string, string> => {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // ---- validate the input ----
  let body: { email?: unknown; password?: unknown; captcha_token?: unknown; verify_only?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const captcha = typeof body.captcha_token === 'string' ? body.captcha_token : '';
  const verifyOnly = body.verify_only === true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 256 || captcha.length > 4096) {
    return json(400, { error: 'Invalid request' });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64);
  const acctKey = `acct:${await sha256Hex(email)}`;
  const ipKey = `ip:${ip}`;

  // ---- the lock check and the real login run at the same time, so a normal login waits only once ----
  // (If the account turns out to be locked the login answer is thrown away and any session it made is ended: nothing is learned from it.)
  const lockCheck = db.rpc('login_locked', { p_keys: [acctKey, ipKey] });
  const login = fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(captcha ? { email, password, gotrue_meta_security: { captcha_token: captcha } } : { email, password }),
  }).catch(() => null);
  const [{ data: wait, error: lockErr }, res] = await Promise.all([lockCheck, login]);
  const out = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};

  const endSession = (accessToken: unknown) =>
    inBackground(fetch(`${url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${accessToken as string}` } }));

  if (lockErr) {
    if (res?.ok) endSession(out.access_token);
    return json(503, { error: 'Sign in did not work. Please try again.' }); // fail closed: never skip the check
  }
  if (typeof wait === 'number' && wait > 0) {
    if (res?.ok) endSession(out.access_token);
    return json(429, { error: `Too many attempts. Please try again in ${Math.ceil(wait / 60)} minutes.`, retry_after: wait }, { 'Retry-After': String(wait) });
  }
  if (!res) return json(503, { error: 'Sign in did not work. Please try again.' });

  if (res.ok) {
    inBackground(db.rpc('login_succeeded', { p_key: acctKey })); // clearing the count can happen after the answer is sent
    if (verifyOnly) {
      // only checking the password (Change password): end the extra session and send nothing back
      endSession(out.access_token);
      return json(200, { ok: true });
    }
    return json(200, out);
  }

  const code = String(out.error_code ?? out.code ?? '');
  const msg = String(out.msg ?? out.message ?? out.error_description ?? '');

  // a failed security check is not a wrong password: it is not counted against the account
  if (/captcha/i.test(code) || /captcha/i.test(msg)) return json(400, { error: 'Please complete the security check and try again.', code: 'captcha' });

  if (res.status === 400 && (code === 'invalid_credentials' || /invalid login credentials/i.test(msg))) {
    // unknown email and wrong password are counted the same way and answered the same way (waited for: the count must not be skipped)
    await db.rpc('login_failed_pair', { p_acct: acctKey, p_ip: ipKey, p_acct_max: ACCOUNT_MAX, p_ip_max: IP_MAX, p_minutes: WINDOW_MINUTES });
    return json(401, { error: 'Wrong email or password' });
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return json(400, { error: 'Please confirm your email first, then sign in. Or use Google.', code: 'email_not_confirmed' });
  }
  if (res.status === 429) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });
  return json(502, { error: 'Sign in did not work. Please try again.' });
});
