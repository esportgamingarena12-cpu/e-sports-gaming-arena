import { expect, test } from '@playwright/test';

/**
 * Change password. A visitor who is not signed in cannot open it (they are sent to the login page).
 * Signed-in checks (the link above Logout for admin, staff and customer, and an actual change) need the test logins
 * in web/.env.e2e and are not run against the live project, so the password of a real account is never touched.
 */
test.describe('change password', () => {
  test('a visitor is sent to the login page', async ({ page }) => {
    await page.goto('/account/password');
    await expect(page).toHaveURL(/\/book\/login/);
  });

  test('there is no Change password link while signed out', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    await expect(page.locator('[data-change-password]')).toHaveCount(0);
    await expect(page.locator('[data-logout]')).toHaveCount(0);
  });
});
