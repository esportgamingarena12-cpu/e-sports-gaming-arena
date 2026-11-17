import { expect, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * A signed-in admin or staff member who opens the site goes to their own dashboard, not the public page mixed with their
 * menus. "View public site" (?preview=1) shows the public page on purpose, with a Back to dashboard button and no sidebar.
 * Needs the admin test account in web/.env.e2e; skips itself when it does not exist in the project.
 */
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;

test.describe('staff and the public home page', () => {
  test.skip(!adminEmail || !adminPassword, 'Set the admin test account in web/.env.e2e');
  let ok = false;
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    ok = res.ok();
  });
  test.beforeEach(() => test.skip(!ok, 'The admin test account does not exist in this project yet'));

  test('the home address opens the dashboard; preview shows the public page without the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.getByLabel('Email').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/book');
    await expect(page).toHaveURL(/\/admin$/);

    await page.locator('[data-view-public]').click();
    await expect(page).toHaveURL(/\/book\?preview=1/);
    await expect(page.locator('[data-slide-welcome]')).toBeAttached();
    await expect(page.locator('aside[aria-label="Main menu"]')).toHaveCount(0);
    await page.locator('[data-back-to-dashboard]').click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
