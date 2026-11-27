import { expect, Page, test } from '@playwright/test';

/**
 * A browser can fill a saved email and password into the boxes without telling the page (Chrome does this until the person touches
 * the page). The test does the same: it sets the boxes' values with no events at all, then signs in. The email and password in the
 * boxes must be what is sent. Supabase's answers are supplied by the test; no real account is used.
 */
const LOGIN = '**/functions/v1/secure-login';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

async function fakeTurnstile(page: Page): Promise<void> {
  await page.route('**/challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: "window.turnstile = { render: (el, o) => { setTimeout(() => o.callback('test-token'), 50); return 'w1'; }, reset: () => {}, remove: () => {} };",
    }),
  );
}

/** Records the body of every real sign-in request and answers "wrong password". */
async function recordLogin(page: Page): Promise<{ email: string; password: string }[]> {
  const sent: { email: string; password: string }[] = [];
  await page.route(LOGIN, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { email?: string; password?: string };
    if (body.email) sent.push({ email: body.email, password: body.password ?? '' });
    return route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'Wrong email or password' }) });
  });
  return sent;
}

/** Sets a box's value the way a silent browser fill does: the box shows it, the page is not told. */
async function silentFill(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).evaluate((el, v) => {
    (el as HTMLInputElement).value = v;
  }, value);
}

test.describe('a saved password filled in by the browser', () => {
  test('staff login: boxes filled with no events still sign in with those values', async ({ page }) => {
    const sent = await recordLogin(page);
    await fakeTurnstile(page);
    await page.goto('/login');
    await silentFill(page, 'input[type="email"]', 'staff@example.com');
    await silentFill(page, '#staff-password', 'SavedPass1');
    // the page notices within a moment and the button comes alive, with no click or key press in between
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Wrong email or password');
    expect(sent).toEqual([{ email: 'staff@example.com', password: 'SavedPass1' }]);
  });

  test('staff login: pressing Enter after a silent fill also sends the values', async ({ page }) => {
    const sent = await recordLogin(page);
    await fakeTurnstile(page);
    await page.goto('/login');
    await page.locator('#staff-password').focus();
    await silentFill(page, 'input[type="email"]', 'staff@example.com');
    await silentFill(page, '#staff-password', 'SavedPass2');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled(); // noticed within a moment
    await page.keyboard.press('Enter');
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({ email: 'staff@example.com', password: 'SavedPass2' });
  });

  test('customer login: the same', async ({ page }) => {
    const sent = await recordLogin(page);
    await fakeTurnstile(page);
    await page.goto('/book/login');
    await expect(page.locator('[data-google]')).toBeVisible();
    await silentFill(page, '[data-signin-form] input[type="email"]', 'player@example.com');
    await silentFill(page, '[data-signin-form] input[type="password"]', 'SavedPass3');
    await expect(page.locator('[data-signin-submit]')).toBeEnabled();
    await page.locator('[data-signin-submit]').click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({ email: 'player@example.com', password: 'SavedPass3' });
  });

  test('empty boxes still keep the button off', async ({ page }) => {
    await fakeTurnstile(page);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});
