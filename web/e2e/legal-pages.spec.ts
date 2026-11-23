import { expect, test } from '@playwright/test';

/** The public legal pages open without signing in and are linked from the home page footer. */
test.describe('legal pages', () => {
  for (const [path, title] of [
    ['/terms', 'Terms & Conditions'],
    ['/privacy', 'Privacy Policy'],
    ['/refunds', 'Refund & Cancellation Policy'],
    ['/grievance', 'Contact & Grievance'],
  ] as const) {
    test(`${path} opens for a visitor`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('[data-legal-title]')).toHaveText(title);
      await expect(page.locator('[data-section]').first()).toBeVisible();
      await expect(page.locator('[data-legal-links]')).toBeVisible();
    });
  }

  test('the home page footer links to all four', async ({ page }) => {
    await page.goto('/book');
    const links = page.locator('[data-legal-links]');
    await expect(links).toBeVisible();
    for (const k of ['terms', 'privacy', 'refunds', 'grievance']) await expect(links.locator(`[data-link-${k}]`)).toBeVisible();
    await links.locator('[data-link-privacy]').click();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('"My data & privacy" needs a customer login', async ({ page }) => {
    await page.goto('/book/my-data');
    await expect(page).toHaveURL(/\/book\/login/);
  });
});
