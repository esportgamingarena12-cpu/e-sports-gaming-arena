import { expect, Page, test } from '@playwright/test';

/**
 * Google sign-in on the customer login page. A real Google sign-in cannot be automated, so these tests check
 * everything up to the hand-off and the way back: the button, the backup email code, what happens when Google is
 * not switched on, what is sent to Supabase, where the customer is returned to, and a cancelled sign-in.
 * Authorize calls are answered by the test, so no real Google or Supabase account is involved.
 */
const AUTHORIZE = '**/auth/v1/authorize**';

async function open(page: Page, width = 1280, path = '/book/login'): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  await expect(page.locator('[data-google]')).toBeVisible();
}

test.describe('Google sign-in', () => {
  test('Google is the main button and the email code is the backup', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-google]')).toContainText('Continue with Google');
    await expect(page.locator('[data-signin-form]')).toBeVisible(); // email and password sign in sits under Google
    await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0); // the code form is only on request

    await page.locator('[data-use-code]').click();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();

    await page.locator('[data-use-google]').click();
    await expect(page.locator('[data-google]')).toBeVisible();
    await expect(page.locator('[data-signin-form]')).toBeVisible();
  });

  test('when Google is not switched on, the customer gets a clear message and the code option', async ({ page }) => {
    await page.route(AUTHORIZE, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ code: 400, error_code: 'validation_failed', msg: 'Unsupported provider: provider is not enabled' }),
      }),
    );
    await open(page);
    await page.locator('[data-google]').click();
    await expect(page.locator('[data-error]')).toContainText('not switched on yet');
    await expect(page.locator('[data-error]')).toContainText('email code');
    await expect(page).toHaveURL(/\/book\/login$/);
    await expect(page.locator('[data-google]')).toBeEnabled(); // can try again
    expect(await page.evaluate(() => sessionStorage.getItem('google-login-pending'))).toBeNull();
  });

  test('tapping the button sends the customer to Google through Supabase and remembers where they were going', async ({ page, baseURL }) => {
    let authorizeUrl = '';
    await page.route(AUTHORIZE, (route) => {
      authorizeUrl = route.request().url();
      return route.fulfill({ status: 302, headers: { location: `${baseURL}/google-stub` } });
    });
    await open(page, 1280, '/book/login?next=/book%3Ftype%3Dps5');
    await page.locator('[data-google]').click();
    await page.waitForURL('**/google-stub');

    const u = new URL(authorizeUrl);
    expect(u.pathname).toBe('/auth/v1/authorize');
    expect(u.searchParams.get('provider')).toBe('google');
    expect(u.searchParams.get('redirect_to')).toBe(`${baseURL}/book/login`);
    expect(u.searchParams.get('prompt')).toBe('select_account');

    const note = JSON.parse((await page.evaluate(() => sessionStorage.getItem('google-login-pending'))) ?? 'null') as { next: string | null } | null;
    expect(note?.next).toBe('/book?type=ps5');
  });

  test('a cancelled Google sign-in shows a friendly message', async ({ page }) => {
    await open(page, 1280, '/book/login#error=access_denied&error_code=access_denied&error_description=Access+denied');
    await expect(page.locator('[data-error]')).toContainText('cancelled');
    await expect(page.locator('[data-google]')).toBeEnabled();
  });

  test('a failed return from Google suggests trying again or the email code', async ({ page }) => {
    await open(page, 1280, '/book/login?error=server_error&error_description=Unable+to+exchange+external+code');
    await expect(page.locator('[data-error]')).toContainText('did not work');
    await expect(page.locator('[data-error]')).toContainText('email code');
  });

  test('without a session, a note left by a Google sign-in explains that it did not finish, once', async ({ page }) => {
    await open(page);
    await page.evaluate(() => sessionStorage.setItem('google-login-pending', JSON.stringify({ next: '/book', at: Date.now() })));
    await page.goto('/book/login'); // a fresh visit, as if Google had sent the customer back
    await expect(page.locator('[data-error]')).toContainText('did not finish');
    // the note is used up, so the next visit shows a clean page
    await page.reload();
    await expect(page.locator('[data-error]')).toHaveCount(0);
  });

  test('the Login link in the top bar leads to the Google login', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/book\/login/);
    await expect(page.locator('[data-google]')).toBeVisible();
  });

  for (const w of [360, 768, 1280]) {
    test(`the login page with the Google button fits at ${w} px`, async ({ page }) => {
      await open(page, w);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
      await page.locator('[data-use-code]').click();
      const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over2).toBeLessThanOrEqual(0);
    });
  }
});
