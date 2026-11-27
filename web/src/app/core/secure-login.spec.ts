import { loginFailureText, secureLogin } from './secure-login';

describe('secure login messages', () => {
  it('a wrong password reads the same whether or not the email has an account', () => {
    expect(loginFailureText(401, { error: 'Wrong email or password' })).toBe('Wrong email or password');
    expect(loginFailureText(401, null)).toBe('Wrong email or password');
  });
  it('a locked account says to try again later, in the servers words', () => {
    expect(loginFailureText(429, { error: 'Too many attempts. Please try again in 15 minutes.' })).toContain('15 minutes');
    expect(loginFailureText(429, null)).toContain('15 minutes');
  });
  it('a failed security check, an unconfirmed email and anything else have their own plain text', () => {
    expect(loginFailureText(400, { code: 'captcha' })).toContain('security check');
    expect(loginFailureText(400, { code: 'email_not_confirmed' })).toContain('confirm your email');
    expect(loginFailureText(502, null)).toBe('Sign in did not work. Please try again. (ref 502)');
    expect(loginFailureText(503, { code: 'lock_check' })).toBe('Sign in did not work. Please try again. (ref 503-lock_check)');
  });
  it('never shows a technical message from the server', () => {
    const t = loginFailureText(500, { error: 'duplicate key value violates unique constraint "x"' });
    expect(t).toBe('Sign in did not work. Please try again. (ref 500)');
    expect(t).not.toContain('duplicate');
  });
});

describe('secureLogin', () => {
  it('returns the two tokens on success and sends the email, password and security token', async () => {
    let sent: { body: Record<string, unknown> } | null = null;
    const sb = {
      functions: {
        invoke: (_n: string, o: { body: Record<string, unknown> }) => {
          sent = o;
          return Promise.resolve({ data: { access_token: 'a', refresh_token: 'r', extra: 'x' }, error: null });
        },
      },
    } as never;
    const t = await secureLogin(sb, { email: 'a@b.in', password: 'pw', captchaToken: 'tok' });
    expect(t).toEqual({ access_token: 'a', refresh_token: 'r' });
    expect(sent!.body).toEqual({ email: 'a@b.in', password: 'pw', captcha_token: 'tok', verify_only: false });
  });
  it('verify only returns nothing', async () => {
    const sb = { functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) } } as never;
    expect(await secureLogin(sb, { email: 'a@b.in', password: 'pw', verifyOnly: true })).toBeNull();
  });
  it('turns a 401 into the plain wrong-password message', async () => {
    const ctx = { status: 401, json: () => Promise.resolve({ error: 'Wrong email or password' }) };
    const sb = { functions: { invoke: () => Promise.resolve({ data: null, error: { context: ctx } }) } } as never;
    await expect(secureLogin(sb, { email: 'a@b.in', password: 'pw' })).rejects.toThrow('Wrong email or password');
  });
  it('turns a 429 into the lock message', async () => {
    const ctx = { status: 429, json: () => Promise.resolve({ error: 'Too many attempts. Please try again in 15 minutes.' }) };
    const sb = { functions: { invoke: () => Promise.resolve({ data: null, error: { context: ctx } }) } } as never;
    await expect(secureLogin(sb, { email: 'a@b.in', password: 'pw' })).rejects.toThrow('15 minutes');
  });
  it('says there is no connection when there is no answer at all', async () => {
    const sb = { functions: { invoke: () => Promise.resolve({ data: null, error: new Error('fetch failed') }) } } as never;
    await expect(secureLogin(sb, { email: 'a@b.in', password: 'pw' })).rejects.toThrow('No connection');
  });
  it('refuses an answer without tokens', async () => {
    const sb = { functions: { invoke: () => Promise.resolve({ data: { nope: 1 }, error: null }) } } as never;
    await expect(secureLogin(sb, { email: 'a@b.in', password: 'pw' })).rejects.toThrow('did not work');
  });
});
