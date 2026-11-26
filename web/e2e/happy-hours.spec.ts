import { expect, Page, test } from '@playwright/test';

/** Happy hours on the public home page. The database answer is mocked, so this does not depend on the shop's own settings. */
const ALL_DAY = { name: 'Test happy hour', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59', percent: 20, station_type: null };

async function mock(page: Page, body: unknown): Promise<void> {
  await page.route('**/rest/v1/rpc/happy_hours_info', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
}

test.describe('happy hours on the home page', () => {
  test('while one is running: a banner, the schedule card, and the happy price with the normal price crossed out', async ({ page }) => {
    await mock(page, { on: true, rules: [ALL_DAY], off_dates: [] });
    await page.goto('/book');
    const banner = page.locator('[data-happy-banner]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('20% off');
    await expect(page.locator('[data-happy-card]')).toBeVisible();
    await expect(page.locator('[data-happy-live]')).toHaveText('On now');
    await expect(page.locator('[data-happy-rule]').first()).toContainText('Every day');
    await expect(page.locator('[data-happy-rule]').first()).toContainText('20% off');
    // the rate card: normal price crossed out, 20% off beside it
    const row = page.locator('[data-rate-row]').first();
    const was = Number((await row.locator('[data-list-price]').first().innerText()).replace(/[^\d.]/g, ''));
    const now = Number((await row.locator('[data-happy-price]').first().innerText()).replace(/[^\d.]/g, ''));
    expect(now).toBeCloseTo(was * 0.8, 1);
    await expect(page.locator('[data-happy-note]')).toBeVisible();
  });

  test('the master switch off, or an off-date today, shows nothing', async ({ page }) => {
    await mock(page, { on: false, rules: [], off_dates: [] });
    await page.goto('/book');
    await expect(page.locator('[data-booking-card]')).toBeVisible();
    await expect(page.locator('[data-happy-banner]')).toHaveCount(0);
    await expect(page.locator('[data-happy-card]')).toHaveCount(0);
    await expect(page.locator('[data-rate-row] [data-happy-price]')).toHaveCount(0);

    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    await page.unroute('**/rest/v1/rpc/happy_hours_info');
    await mock(page, { on: true, rules: [ALL_DAY], off_dates: [{ day: today, label: 'Holiday' }] });
    await page.goto('/book');
    await expect(page.locator('[data-booking-card]')).toBeVisible();
    await expect(page.locator('[data-happy-banner]')).toHaveCount(0); // today is an off-date
    await expect(page.locator('[data-happy-card]')).toBeVisible(); // the schedule is still listed
    await expect(page.locator('[data-happy-off]')).toContainText('Holiday');
  });

  test('when the database cannot answer, the page still works without happy hours', async ({ page }) => {
    await page.route('**/rest/v1/rpc/happy_hours_info', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"missing"}' }));
    await page.goto('/book');
    await expect(page.locator('[data-booking-card]')).toBeVisible();
    await expect(page.locator('[data-happy-banner]')).toHaveCount(0);
    await expect(page.locator('[data-rate-row]').first()).toBeVisible();
  });

  test('it fits at 360 px with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mock(page, { on: true, rules: [ALL_DAY, { ...ALL_DAY, name: 'PS5 only', percent: 30, station_type: 'ps5', days: [6, 0], start: '12:00', end: '15:00' }], off_dates: [] });
    await page.goto('/book');
    await expect(page.locator('[data-happy-card]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
