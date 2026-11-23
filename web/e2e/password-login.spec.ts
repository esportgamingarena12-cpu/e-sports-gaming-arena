import { expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * Customer sign up and sign in with an email and password, and "Remember me". Supabase's answers are supplied by
 * the test, so no real account is created or used.
 */
const SIGNUP = '**/auth/v1/signup**';
const TOKEN = '**/auth/v1/token?grant_type=password**';
const REF = new URL(environment.SUPABASE_URL).hostname.split('.')[0];
const STORE_KEY = `sb-${REF}-auth-token`;

async function open(page: Page, width = 1280): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/book/login');
  await expect(page.locator('[data-google]')).toBeVisible();
}

async function toSignUp(page: Page): Promise<void> {
  await page.locator('[data-tab-signup]').click();
  await expect(page.locator('[data-signup-form]')).toBeVisible();
}

async function fillSignUp(page: Page, over: { name?: string; email?: string; password?: string; confirm?: string; agree?: boolean } = {}): Promise<void> {
  await page.locator('[data-su-name]').fill(over.name ?? 'Test Player');
  await page.locator('[data-su-email]').fill(over.email ?? 'player@example.com');
  await page.locator('[data-su-password]').fill(over.password ?? 'Gaming2026');
  await page.locator('[data-su-confirm]').fill(over.confirm ?? over.password ?? 'Gaming2026');
  // the Terms and Privacy Policy box is required; ticked unless a test says otherwise
  if (over.agree !== false) await page.locator('[data-su-agree]').check();
}

test.describe('create account and sign in with a password', () => {
  test('Google first, then Sign in and Create account tabs, and nothing else', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-signin-form]')).toBeVisible();
    await expect(page.locator('[data-tab-signin]')).toHaveAttribute('aria-selected', 'true');
    await toSignUp(page);
    await expect(page.locator('[data-tab-signup]')).toHaveAttribute('aria-selected', 'true');
    for (const k of ['su-name', 'su-email', 'su-password', 'su-confirm', 'su-agree']) await expect(page.locator(`[data-${k}]`)).toBeVisible();
    await expect(page.locator('[data-google]')).toBeVisible();
    await expect(page.locator('[data-use-code]')).toHaveCount(0); // no emailed-code option any more
    await page.locator('[data-tab-signin]').click();
    await expect(page.locator('[data-signin-form]')).toBeVisible();
  });

  test('the sign-up form cannot be sent until the Terms and Privacy Policy box is ticked', async ({ page }) => {
    await open(page);
    await toSignUp(page);
    await expect(page.locator('[data-su-agree]')).not.toBeChecked();
    await fillSignUp(page, { agree: false });
    await expect(page.locator('[data-signup-submit]')).toBeDisabled();
    await page.locator('[data-su-agree]').check();
    await expect(page.locator('[data-signup-submit]')).toBeEnabled();
    // the links open the real pages in a new tab
    await expect(page.locator('[data-signup-form] a[href="/terms"]')).toHaveAttribute('target', '_blank');
    await expect(page.locator('[data-signup-form] a[href="/privacy"]')).toHaveAttribute('target', '_blank');
  });

  test('"Remember me" is ticked by default on both forms', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-remember]')).toBeChecked();
    await toSignUp(page);
    await expect(page.locator('[data-su-remember]')).toBeChecked();
  });

  test('the sign-up form checks the password and the confirmation before it can be sent', async ({ page }) => {
    await open(page);
    await toSignUp(page);
    const submit = page.locator('[data-signup-submit]');
    await expect(submit).toBeDisabled();

    await fillSignUp(page, { password: 'short1', confirm: 'short1' });
    await page.locator('[data-su-name]').click(); // leave the password field
    await expect(page.locator('[data-su-weak]')).toContainText('at least 8');
    await expect(submit).toBeDisabled();

    await fillSignUp(page, { password: 'onlyletters', confirm: 'onlyletters' });
    await page.locator('[data-su-name]').click();
    await expect(page.locator('[data-su-weak]')).toContainText('number');

    await fillSignUp(page, { password: 'Gaming2026', confirm: 'Gaming2027' });
    await expect(page.locator('[data-su-mismatch]')).toContainText('not the same');
    await expect(submit).toBeDisabled();

    await fillSignUp(page, { password: 'Gaming2026', confirm: 'Gaming2026' });
    await expect(page.locator('[data-su-mismatch]')).toHaveCount(0);
    await expect(submit).toBeEnabled();
  });

  test('the show/hide button reveals what was typed', async ({ page }) => {
    await open(page);
    const pw = page.locator('[data-si-password]');
    await expect(pw).toHaveAttribute('type', 'password');
    await page.locator('[data-toggle-password]').click();
    await expect(pw).toHaveAttribute('type', 'text');
    await page.locator('[data-toggle-password]').click();
    await expect(pw).toHaveAttribute('type', 'password');
  });

  test('sign up sends the name, email and password to Supabase; an existing email gets a clear message', async ({ page }) => {
    let body: { email?: string; password?: string; data?: { full_name?: string } } = {};
    await page.route(SIGNUP, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ code: 422, error_code: 'user_already_exists', msg: 'User already registered' }),
      });
    });
    await open(page);
    await toSignUp(page);
    await fillSignUp(page, { name: 'Asha Rao', email: 'asha@example.com', password: 'Gaming2026' });
    await page.locator('[data-signup-submit]').click();
    await expect(page.locator('[data-error]')).toContainText('already has an account');
    expect(body.email).toBe('asha@example.com');
    expect(body.password).toBe('Gaming2026');
    expect(body.data?.full_name).toBe('Asha Rao');
    await expect(page.locator('[data-signup-form]')).toBeVisible(); // stays so the customer can correct it
  });

  test('when the project asks for the email to be confirmed, the customer is told to check their inbox', async ({ page }) => {
    await page.route(SIGNUP, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          id: 'user-1', aud: 'authenticated', role: '', email: 'newbie@example.com', phone: '',
          confirmation_sent_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'New Bie' },
          identities: [{ identity_id: 'i1', id: 'user-1', user_id: 'user-1', provider: 'email', identity_data: { email: 'newbie@example.com' } }],
        }),
      }),
    );
    await open(page);
    await toSignUp(page);
    await fillSignUp(page, { name: 'New Bie', email: 'newbie@example.com' });
    await page.locator('[data-signup-submit]').click();
    await expect(page.locator('[data-info]')).toContainText('newbie@example.com');
    await expect(page.locator('[data-signin-form]')).toBeVisible();
    await expect(page.locator('[data-si-email]')).toHaveValue('newbie@example.com');
  });

  test('sign in with a wrong password shows a plain message and sends the email and password', async ({ page }) => {
    let body: { email?: string; password?: string } = {};
    await page.route(TOKEN, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      });
    });
    await open(page);
    await page.locator('[data-si-email]').fill('player@example.com');
    await page.locator('[data-si-password]').fill('WrongOne1');
    await page.locator('[data-signin-submit]').click();
    await expect(page.locator('[data-error]')).toContainText('Wrong email or password');
    expect(body).toMatchObject({ email: 'player@example.com', password: 'WrongOne1' });
    await expect(page).toHaveURL(/\/book\/login/);
  });

  test('the sign-in button needs an email and a password', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-signin-submit]')).toBeDisabled();
    await page.locator('[data-si-email]').fill('player@example.com');
    await expect(page.locator('[data-signin-submit]')).toBeDisabled();
    await page.locator('[data-si-password]').fill('x');
    await expect(page.locator('[data-signin-submit]')).toBeEnabled();
  });

  for (const w of [360, 768, 1280]) {
    test(`both forms fit at ${w} px with no sideways scroll`, async ({ page }) => {
      await open(page, w);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await toSignUp(page);
      await page.locator('[data-su-password]').fill('Gaming2026');
      await page.locator('[data-su-confirm]').fill('different1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('remember me', () => {
  const fakeSession = () => ({
    access_token: 'aaa.bbb.ccc',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresh-1',
    user: { id: 'user-1', aud: 'authenticated', email: 'player@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  });

  async function stubBackend(page: Page, logouts: string[]): Promise<void> {
    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ id: 'user-1', email: 'player@example.com', full_name: 'Player', phone: null, role: 'customer', active: true, consent_version: '2026-11-23' }),
      }),
    );
    await page.route('**/rest/v1/customers**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: 'null' }),
    );
    await page.route('**/auth/v1/logout**', (route) => {
      logouts.push(route.request().url());
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    });
  }

  test('a customer who unticked it is signed out when a new browser session starts', async ({ page }) => {
    const logouts: string[] = [];
    await stubBackend(page, logouts);
    await page.goto('/book'); // creates the page's storage origin
    await page.evaluate(
      ([key, session]) => {
        localStorage.setItem(key as string, JSON.stringify(session));
        localStorage.setItem('remember-me', '0');
        sessionStorage.removeItem('session-alive'); // as if the browser had been closed and opened again
      },
      [STORE_KEY, fakeSession()],
    );
    await page.reload();
    await expect.poll(() => logouts.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), STORE_KEY)).toBeNull();
  });

  test('a customer who stayed ticked is still signed in on a new browser session', async ({ page }) => {
    const logouts: string[] = [];
    await stubBackend(page, logouts);
    await page.goto('/book');
    await page.evaluate(
      ([key, session]) => {
        localStorage.setItem(key as string, JSON.stringify(session));
        localStorage.setItem('remember-me', '1');
        sessionStorage.removeItem('session-alive');
      },
      [STORE_KEY, fakeSession()],
    );
    await page.reload();
    await page.waitForTimeout(2500);
    expect(logouts).toHaveLength(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), STORE_KEY)).not.toBeNull();
  });
});
