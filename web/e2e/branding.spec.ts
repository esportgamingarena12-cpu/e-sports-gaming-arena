import { expect, test } from '@playwright/test';

/** The home page wording comes from Settings > Branding; with nothing set (or no answer) the standard wording shows. */
const CUSTOM = {
  shop_name: 'Pixel Zone Arena',
  tagline: 'Game | Win | Repeat',
  hero_text: 'Our own welcome paragraph.',
  features: [
    { title: 'Fast PCs', text: 'Zero lag' },
    { title: 'Cold drinks', text: 'At your seat' },
  ],
  studio_title: 'Best *Gaming* Place',
  studio_text: 'Welcome to {shop}: cancel until {hours} h before.',
  checks: ['Own check one', 'Own check two'],
  rates_intro: 'Own rates intro.',
  canteen_intro: 'Own canteen intro.',
  passes_intro: 'Own passes intro.',
  band_title: 'Own band title',
  band_text: 'Own band line.',
  footer: '(c) {shop}',
};

test.describe('branding', () => {
  test('the standard wording shows when nothing is set', async ({ page }) => {
    await page.route('**/rest/v1/rpc/branding_info', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"missing"}' }));
    await page.goto('/book');
    await expect(page.locator('[data-hero-title]')).toContainText('E-SPORTS');
    await expect(page.locator('[data-hero-title]')).toContainText('GAMING ARENA');
    await expect(page.locator('[data-tagline]')).toContainText('Play');
    await expect(page.locator('[data-tagline]')).toContainText('Repeat');
    await expect(page.locator('[data-studio-title]')).toHaveText('The Ultimate Gaming Studio in Your City');
    await expect(page.locator('[data-features]')).toContainText('High-End PCs & Consoles');
    await expect(page.locator('[data-checks]')).toContainText('Performance gaming PCs');
    await expect(page.locator('[data-footer]')).toContainText('© E-Sports Gaming Arena');
  });

  test('the shop\'s own wording replaces it', async ({ page }) => {
    await page.route('**/rest/v1/rpc/branding_info', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CUSTOM) }));
    await page.goto('/book');
    await expect(page.locator('[data-hero-title]')).toContainText('PIXEL');
    await expect(page.locator('[data-hero-title]')).toContainText('ZONE ARENA');
    await expect(page.locator('[data-tagline]')).toContainText('Win');
    await expect(page.getByText('Our own welcome paragraph.')).toBeVisible();
    await expect(page.locator('[data-features]')).toContainText('Fast PCs');
    await expect(page.locator('[data-features]')).not.toContainText('High-End PCs');
    await expect(page.locator('[data-studio-title] .glow-text')).toHaveText('Gaming');
    await expect(page.locator('[data-checks]')).toContainText('Own check two');
    await expect(page.locator('[data-footer]')).toContainText('(c) Pixel Zone Arena');
    await expect(page).toHaveTitle('Pixel Zone Arena');
  });

  test('wording with html in it is shown as text, never run', async ({ page }) => {
    await page.route('**/rest/v1/rpc/branding_info', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...CUSTOM, hero_text: '<img src=x onerror="window.__xss=1"><b>bold</b>' }) }),
    );
    await page.goto('/book');
    await expect(page.getByText('<b>bold</b>', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('a long shop name stays inside the login sign', async ({ page }) => {
    await page.route('**/rest/v1/rpc/branding_info', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...CUSTOM, shop_name: 'Supercalifragilistic Entertainment Gaming Lounge' }) }),
    );
    await page.goto('/login');
    await expect(page.locator('svg text[textLength]').first()).toBeAttached();
  });
});
