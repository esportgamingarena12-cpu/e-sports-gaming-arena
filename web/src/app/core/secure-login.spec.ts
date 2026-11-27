import { loginFailureText, retryOnce, secureLogin, TransientLoginError } from './secure-login';

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
    expect(loginFailureText(502, null)).toBe('The connection to the server is unstable. Please try again. (ref 502)');
    expect(loginFailureText(504, null)).toBe('The connection to the server is unstable. Please try again. (ref 504)');
    expect(loginFailureText(418, { code: 'odd_thing' })).toBe('Sign in did not work. Please try again. (ref 418-odd_thing)');
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

describe('a failure that is only the connection', () => {
  const failing = (status: number | null) =>
    ({
      functions: {
        invoke: () =>
          Promise.resolve({
            data: null,
            error: status === null ? new Error('Failed to fetch') : Object.assign(new Error('x'), { context: { status, json: () => Promise.resolve(null) } }),
          }),
      },
    }) as never;

  it('no answer, or a gateway timeout (502, 503, 504), is marked as only the connection', async () => {
    await expect(secureLogin(failing(null), { email: 'a@b.in', password: 'p' })).rejects.toBeInstanceOf(TransientLoginError);
    for (const s of [502, 503, 504]) await expect(secureLogin(failing(s), { email: 'a@b.in', password: 'p' })).rejects.toBeInstanceOf(TransientLoginError);
  });
  it('a wrong password, a lock and a failed security check are never marked that way', async () => {
    for (const s of [400, 401, 429]) {
      const err = await secureLogin(failing(s), { email: 'a@b.in', password: 'p' }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(TransientLoginError);
    }
  });
});

describe('retryOnce', () => {
  it('tries a second time after a connection failure, after getting ready again', async () => {
    let calls = 0;
    let prepared = 0;
    const out = await retryOnce(
      async () => {
        calls++;
        if (calls === 1) throw new TransientLoginError('slow');
        return 'ok';
      },
      async () => {
        prepared++;
      },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(2);
    expect(prepared).toBe(1);
  });
  it('never tries a wrong password twice', async () => {
    let calls = 0;
    await expect(
      retryOnce(
        async () => {
          calls++;
          throw new Error('Wrong email or password');
        },
        async () => undefined,
      ),
    ).rejects.toThrow('Wrong email or password');
    expect(calls).toBe(1);
  });
  it('gives up after one more try', async () => {
    let calls = 0;
    await expect(
      retryOnce(
        async () => {
          calls++;
          throw new TransientLoginError('still slow');
        },
        async () => undefined,
      ),
    ).rejects.toThrow('still slow');
    expect(calls).toBe(2);
  });
  it('a success needs no second try and no preparing', async () => {
    let prepared = 0;
    expect(await retryOnce(async () => 7, async () => void prepared++)).toBe(7);
    expect(prepared).toBe(0);
  });
});
