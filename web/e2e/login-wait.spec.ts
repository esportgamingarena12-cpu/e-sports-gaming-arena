import { expect, Page, test } from '@playwright/test';

/**
 * The login security check takes a moment. Someone who fills in the form and presses Sign in before it is ready must not get an
 * error: the page says "Checking security…" at once, and a sign-in started early waits for the check and then goes ahead by itself.
 * Also: the staff login has "Remember me" (ticked by default), like the customer login.
 * Supabase's and Cloudflare's answers are supplied by the test.
 */
const LOGIN = '**/functions/v1/secure-login';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** A security check that hands over its token only after `delayMs`. */
async function slowTurnstile(page: Page, delayMs: number): Promise<void> {
  await page.route('**/challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `window.turnstile = { render: (el, o) => { setTimeout(() => o.callback('slow-token'), ${delayMs}); return 'w1'; }, reset: () => {}, remove: () => {} };`,
    }),
  );
}

async function recordLogin(page: Page): Promise<{ token: string; at: number }[]> {
  const sent: { token: string; at: number }[] = [];
  await page.route(LOGIN, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { email?: string; captcha_token?: string };
    if (body.email) sent.push({ token: body.captcha_token ?? '', at: Date.now() });
    return route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'Wrong email or password' }) });
  });
  return sent;
}

test.describe('the security check and an early Sign in', () => {
  test('"Checking security…" shows at once and turns into "Security check passed"', async ({ page }) => {
    await slowTurnstile(page, 1500);
    await page.goto('/login');
    await expect(page.locator('[data-turnstile-checking]')).toBeVisible();
    await expect(page.locator('[data-turnstile-passed]')).toHaveCount(0);
    await expect(page.locator('[data-turnstile-passed]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-turnstile-checking]')).toHaveCount(0);
  });

  test('staff login: pressing Sign in before the check is ready waits, then sends the real token (no security-check error)', async ({ page }) => {
    const sent = await recordLogin(page);
    await slowTurnstile(page, 2500);
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('staff@example.com');
    await page.locator('#staff-password').fill('WrongOne1');
    const clickedAt = Date.now();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: /Checking security/ })).toBeVisible();
    expect(sent).toHaveLength(0); // nothing was sent without the token
    await expect(page.getByRole('alert')).toContainText('Wrong email or password', { timeout: 15_000 });
    expect(sent).toHaveLength(1);
    expect(sent[0].token).toBe('slow-token');
    expect(sent[0].at - clickedAt).toBeGreaterThan(1000); // it really waited for the check
    await expect(page.getByRole('alert')).not.toContainText('security check');
  });

  test('customer login: the same', async ({ page }) => {
    const sent = await recordLogin(page);
    await slowTurnstile(page, 2000);
    await page.goto('/book/login');
    await expect(page.locator('[data-google]')).toBeVisible();
    await page.locator('[data-signin-form] input[type="email"]').fill('player@example.com');
    await page.locator('[data-signin-form] input[type="password"]').fill('WrongOne1');
    await page.locator('[data-signin-submit]').click();
    await expect(page.locator('[data-signin-submit]')).toContainText('Checking security');
    await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
    expect(sent[0].token).toBe('slow-token');
  });

  test('when the check never comes, a login still goes ahead after the wait and the server answers', async ({ page }) => {
    test.setTimeout(60_000);
    const sent = await recordLogin(page);
    // the script loads but never hands over a token
    await page.route('**/challenges.cloudflare.com/turnstile/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.turnstile = { render: () => 'w1', reset: () => {}, remove: () => {} };" }),
    );
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('staff@example.com');
    await page.locator('#staff-password').fill('WrongOne1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect.poll(() => sent.length, { timeout: 40_000 }).toBe(1);
    expect(sent[0].token).toBe('');
  });
});

test.describe('Remember me on the staff login', () => {
  test('it is there and ticked by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('[data-remember]')).toBeVisible();
    await expect(page.locator('[data-remember]')).toBeChecked();
  });

  test('it can be unticked', async ({ page }) => {
    await page.goto('/login');
    await page.locator('[data-remember]').uncheck();
    await expect(page.locator('[data-remember]')).not.toBeChecked();
  });
});

/** A well-formed (unsigned) token the browser can read, valid for an hour. */
function fakeJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'staff-1', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

async function stubStaffSignIn(page: Page): Promise<void> {
  const token = fakeJwt();
  const user = { id: 'staff-1', aud: 'authenticated', email: 'staff@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  await page.route(LOGIN, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-1', user }),
    });
  });
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(user) }));
  await page.route('**/rest/v1/profiles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ id: 'staff-1', email: 'staff@example.com', full_name: 'Counter', phone: null, role: 'staff', active: true, consent_version: null }),
    }),
  );
  await page.route('**/rest/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }));
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, headers: CORS }));
}

test.describe('Remember me is saved for staff', () => {
  for (const [ticked, expected] of [[true, '1'], [false, '0']] as const) {
    test(`${ticked ? 'ticked' : 'unticked'}: the choice is saved as "${expected}" after a successful sign-in`, async ({ page }) => {
      await stubStaffSignIn(page);
      await slowTurnstile(page, 100);
      await page.goto('/login');
      await page.locator('input[type="email"]').fill('staff@example.com');
      await page.locator('#staff-password').fill('RightOne1');
      if (!ticked) await page.locator('[data-remember]').uncheck();
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect.poll(() => page.evaluate(() => localStorage.getItem('remember-me')), { timeout: 15_000 }).toBe(expected);
    });
  }
});
