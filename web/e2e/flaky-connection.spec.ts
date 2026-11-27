import { expect, Page, test } from '@playwright/test';

/**
 * A weak connection on one computer must not break signing in or sign people out:
 *  - a sign-in that fails only because the connection dropped (no answer, or a gateway timeout) is tried once more by itself;
 *  - a wrong password is never tried twice;
 *  - if the account cannot be loaded because the connection failed, the message says so (not "Account disabled") and nothing is signed out;
 *  - Logout ends the login in this browser only (the shared staff account stays signed in on the other computers);
 *  - a page that cannot be loaded shows a message with a Try again button instead of an empty page.
 * Supabase's and Cloudflare's answers are supplied by the test.
 */
const LOGIN = '**/functions/v1/secure-login';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** A security check that hands over a new token each time (the first 't1', then 't2' after a reset). */
async function turnstile(page: Page): Promise<void> {
  await page.route('**/challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: "let n = 0, cb = null; window.turnstile = { render: (el, o) => { cb = o.callback; setTimeout(() => cb('t' + (++n)), 50); return 'w1'; }, reset: () => setTimeout(() => cb && cb('t' + (++n)), 100), remove: () => {} };",
    }),
  );
}

function fakeJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'staff-1', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}
const USER = { id: 'staff-1', aud: 'authenticated', email: 'staff@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

/** Everything else the staff sign-in needs. `profile` says what the account lookup answers. */
async function backend(page: Page, profile: 'ok' | 'fail', logouts: string[]): Promise<void> {
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(USER) }));
  await page.route('**/rest/v1/profiles**', (route) =>
    profile === 'fail'
      ? route.fulfill({ status: 500, contentType: 'application/json', headers: CORS, body: '{"message":"upstream trouble"}' })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify({ id: 'staff-1', email: 'staff@example.com', full_name: 'Counter', phone: null, role: 'staff', active: true, consent_version: null }),
        }),
  );
  await page.route('**/rest/v1/**', (route) => (route.request().url().includes('/profiles') ? route.fallback() : route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' })));
  await page.route('**/auth/v1/logout**', (route) => {
    logouts.push(route.request().url());
    return route.fulfill({ status: 204, headers: CORS });
  });
}

function success() {
  return {
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify({ access_token: fakeJwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-1', user: USER }),
  };
}

/** Answers the sign-in requests in order with the given handlers; returns the tokens that were sent. */
async function script(page: Page, answers: ('abort' | 504 | 401 | 'ok')[]): Promise<string[]> {
  const tokens: string[] = [];
  let i = 0;
  await page.route(LOGIN, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { email?: string; captcha_token?: string };
    if (!body.email) return route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{"error":"Invalid request"}' }); // the warm-up
    tokens.push(body.captcha_token ?? '');
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a === 'abort') return route.abort('connectionfailed');
    if (a === 504) return route.fulfill({ status: 504, contentType: 'application/json', headers: CORS, body: '{}' });
    if (a === 401) return route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: '{"error":"Wrong email or password"}' });
    return route.fulfill(success());
  });
  return tokens;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('staff@example.com');
  await page.locator('#staff-password').fill('SomePass1');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('a weak connection while signing in', () => {
  test('a gateway timeout (504) is tried once more, with a fresh security check, and then signs in', async ({ page }) => {
    const logouts: string[] = [];
    await turnstile(page);
    await backend(page, 'ok', logouts);
    const tokens = await script(page, [504, 'ok']);
    await signIn(page);
    await expect(page).toHaveURL(/\/counter|\/admin/, { timeout: 20_000 });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).not.toBe(tokens[1]); // a security check is used once: the second try had a new one
  });

  test('no answer at all (the connection dropped) is tried once more and signs in', async ({ page }) => {
    const logouts: string[] = [];
    await turnstile(page);
    await backend(page, 'ok', logouts);
    const tokens = await script(page, ['abort', 'ok']);
    await signIn(page);
    await expect(page).toHaveURL(/\/counter|\/admin/, { timeout: 20_000 });
    expect(tokens).toHaveLength(2);
  });

  test('a wrong password is never tried twice', async ({ page }) => {
    await turnstile(page);
    const tokens = await script(page, [401, 'ok']);
    await signIn(page);
    await expect(page.getByRole('alert')).toContainText('Wrong email or password');
    await page.waitForTimeout(1500);
    expect(tokens).toHaveLength(1);
  });

  test('a connection that stays bad shows a plain message after the second try', async ({ page }) => {
    await turnstile(page);
    const tokens = await script(page, [504, 504]);
    await signIn(page);
    await expect(page.getByRole('alert')).toContainText('connection to the server is unstable', { timeout: 20_000 });
    expect(tokens).toHaveLength(2);
  });
});

test.describe('the account cannot be loaded because of the connection', () => {
  test('the message says so, not "Account disabled", and nothing is signed out on any computer', async ({ page }) => {
    const logouts: string[] = [];
    await turnstile(page);
    await backend(page, 'fail', logouts);
    await script(page, ['ok']);
    await signIn(page);
    await expect(page.getByRole('alert').first()).toContainText('Could not load your account', { timeout: 20_000 });
    await expect(page.getByText('Account disabled')).toHaveCount(0);
    expect(logouts).toEqual([]); // no logout of any kind was sent
  });
});

test.describe('Logout', () => {
  test('ends the login in this browser only (scope=local), so the other computers stay signed in', async ({ page }) => {
    const logouts: string[] = [];
    await turnstile(page);
    await backend(page, 'ok', logouts);
    await script(page, ['ok']);
    await signIn(page);
    await expect(page).toHaveURL(/\/counter|\/admin/, { timeout: 20_000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-user-menu]').click();
    await page.getByRole('button', { name: /Logout/ }).first().click();
    await expect.poll(() => logouts.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(logouts.every((u) => u.includes('scope=local'))).toBe(true);
  });
});

test.describe('a page that cannot be loaded', () => {
  /** A page piece that fails to load (an unhandled import error), the way a bad connection or an old saved copy shows up. */
  async function failToLoadAPiece(page: Page): Promise<void> {
    await page.evaluate(() => {
      const promise = Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://example.test/chunk-ABC.js'));
      promise.catch(() => undefined);
      window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise, reason: new TypeError('Failed to fetch dynamically imported module: https://example.test/chunk-ABC.js') }));
    });
  }

  test('the first failure clears the saved copy and reloads once by itself', async ({ page }) => {
    await turnstile(page);
    await page.goto('/book/login');
    await expect(page.locator('[data-google]')).toBeVisible();
    await Promise.all([page.waitForEvent('load', { timeout: 20_000 }), failToLoadAPiece(page)]);
    await expect(page.locator('[data-google]')).toBeVisible();
    await expect(page.locator('[data-page-failed]')).toHaveCount(0);
  });

  test('a second failure shows a message with a Try again button instead of an empty page', async ({ page }) => {
    await turnstile(page);
    await page.goto('/book/login');
    await expect(page.locator('[data-google]')).toBeVisible();
    // the automatic recovery was just tried
    await page.evaluate(() => sessionStorage.setItem('app-update-reload-at', String(Date.now())));
    await failToLoadAPiece(page);
    await expect(page.locator('[data-page-failed]')).toBeVisible();
    await expect(page.locator('[data-page-retry]')).toBeVisible();
    await expect(page.locator('header')).toBeVisible(); // the top bar is still there
  });
});
