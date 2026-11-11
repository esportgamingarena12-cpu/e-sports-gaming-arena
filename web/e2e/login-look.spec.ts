import { expect, test } from '@playwright/test';

/** The login pages: animated banner, icons, show/hide password, real rates, and no sideways scroll on any size. */
const SIZES = [
  { w: 360, h: 740 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
];

for (const path of ['/login', '/book/login']) {
  for (const s of SIZES) {
    test(`${path} fits at ${s.w} px and shows the banner`, async ({ page }) => {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.goto(path);
      await expect(page.locator('[data-stage]')).toBeVisible();
      await expect(page.locator('input').first()).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
}

test('staff login: password can be shown and hidden', async ({ page }) => {
  await page.goto('/login');
  const pw = page.getByPlaceholder('Your password');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.locator('[data-toggle-password]').click();
  await expect(pw).toHaveAttribute('type', 'text');
  await page.locator('[data-toggle-password]').click();
  await expect(pw).toHaveAttribute('type', 'password');
});

test('customer login: the banner shows the real hourly rates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/book/login');
  await expect(page.locator('[data-chips]')).toContainText(/from ₹\d+\/h/);
  await expect(page.locator('[data-chips]')).toContainText('Pay at the counter');
});

test('the banner stands still for people who ask for less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/book/login');
  const name = await page.locator('.ls-bar').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('none');
});
