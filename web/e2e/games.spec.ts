import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * Phase 20: the games list on the home page and the coming-soon ticker. The public checks use the starter list
 * (or whatever the owner has entered). The admin checks need the admin test account in web/.env.e2e.
 */
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;

async function openGamesSlide(page: Page, width = 1280): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/book');
  await expect(page.locator('[data-slide]')).toHaveCount(4);
  await page.locator('[data-dot-index="1"]').click();
}

test.describe('games on the home page', () => {
  test('the games slide lists the games as posters', async ({ page }) => {
    await openGamesSlide(page);
    const cards = page.locator('[data-game-card]');
    await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(1);
    expect(await cards.count()).toBeLessThanOrEqual(8);
    await expect(page.locator('[data-slide-games] h2')).toContainText('Games available in');
    // every card has a title and a platform line
    await expect(cards.first().locator('p').first()).not.toBeEmpty();
  });

  test('the PC / PS5 filter narrows the list and All brings everything back', async ({ page }) => {
    await openGamesSlide(page);
    const cards = page.locator('[data-game-card]');
    await expect.poll(() => cards.count()).toBeGreaterThan(0);
    const all = await cards.allInnerTexts();
    await page.locator('[data-filter="PS5"]').click();
    await expect.poll(async () => (await cards.allInnerTexts()).join('|')).not.toBe(all.join('|'));
    for (const t of await page.locator('[data-game-card] p:nth-of-type(2)').allInnerTexts()) {
      expect(t.toUpperCase()).toMatch(/PS5/); // PS5 games, or games on every platform ("PC · PS5")
    }
    await page.locator('[data-filter-all]').click();
    await expect.poll(async () => (await cards.allInnerTexts()).join('|')).toBe(all.join('|'));
  });

  test('the ticker shows upcoming games across the top', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    const ticker = page.locator('[data-ticker]');
    await expect(ticker).toBeVisible();
    await expect(ticker.locator('[data-ticker-label]')).toHaveText(/Coming soon|New games|New & coming soon/i);
    await expect(ticker.locator('[data-ticker-item]').first()).toContainText(/SOON|NEW/);
    // the copy used for the endless loop is hidden from screen readers
    await expect(ticker.locator('.ticker-copy').first()).toHaveAttribute('aria-hidden', 'true');
  });

  test('the ticker scrolls, pauses on hover, and stands still for people who ask for less motion', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    const track = page.locator('.ticker-track');
    await expect(track).toBeVisible();
    expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe('ticker-scroll');
    await page.locator('.ticker-viewport').hover();
    expect(await track.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('[data-ticker]')).toBeVisible();
    expect(await page.locator('.ticker-track').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.locator('.ticker-copy').first()).toBeHidden();
  });

  for (const w of [360, 768, 1280]) {
    test(`the ticker and the games slide fit at ${w} px`, async ({ page }) => {
      await openGamesSlide(page, w);
      await page.waitForTimeout(900);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-ticker]')).toBeVisible();
    });
  }
});

test.describe('admin games', () => {
  test.skip(!adminEmail || !adminPassword, 'Set the admin test account in web/.env.e2e');
  test.describe.configure({ mode: 'serial' });

  let adminOk = false;
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    adminOk = res.ok();
  });
  test.beforeEach(() => test.skip(!adminOk, 'The admin test account does not exist in this project yet'));

  async function token(request: APIRequestContext): Promise<string> {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    return ((await res.json()) as { access_token: string }).access_token;
  }

  test.afterAll(async ({ request }) => {
    if (!adminOk) return;
    const t = await token(request);
    await request.delete(`${SB}/rest/v1/games?title=like.E2E%25`, { headers: { apikey: KEY, Authorization: `Bearer ${t}` } });
  });

  async function login(page: Page): Promise<void> {
    await page.goto('/login');
    await page.getByLabel('Email').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }

  test('the admin adds a hot game and a coming-soon game; the home page and ticker follow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await page.goto('/admin/games');

    await page.locator('[data-new]').click();
    await page.locator('[data-title]').fill('E2E Hot Game');
    await page.locator('[data-platform]').selectOption('pc');
    await page.locator('[data-hot]').check();
    await page.locator('[data-save]').click();
    await expect(page.locator('[data-game="E2E Hot Game"]')).toContainText('HOT');

    await page.locator('[data-new]').click();
    await page.locator('[data-title]').fill('E2E Soon Game');
    await page.locator('[data-status]').selectOption('upcoming');
    await page.locator('[data-release]').fill('2030-01-01');
    await page.locator('[data-save]').click();
    await expect(page.locator('[data-game="E2E Soon Game"]')).toContainText('1 Jan 2030');

    await page.goto('/book');
    await expect(page.locator('[data-ticker]')).toContainText('E2E Soon Game · 1 Jan 2030');
    await page.locator('[data-dot-index="1"]').click();
    await expect(page.locator('[data-game-card="E2E Hot Game"] [data-badge-hot]')).toBeVisible();

    // a poster can be added straight from the list, without opening the form
    await page.goto('/admin/games');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const row = page.locator('[data-game="E2E Hot Game"]');
    await expect(row.locator('[data-no-poster]')).toBeVisible();
    await row.locator('[data-quick-file]').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: png });
    await expect(row.locator('[data-poster-img]')).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('[data-no-poster]')).toHaveCount(0);
    await expect(row.locator('[data-poster-button]')).toContainText('Change poster');

    // make a game inactive and active again straight from the list
    await page.goto('/admin/games');
    const hot = page.locator('[data-game="E2E Hot Game"]');
    await hot.locator('[data-toggle-active]').click();
    await expect(hot.locator('[data-toggle-active]')).toHaveText('Make active');
    await hot.locator('[data-toggle-active]').click();
    await expect(hot.locator('[data-toggle-active]')).toHaveText('Make inactive');

    // delete both from the list, after a yes
    for (const title of ['E2E Hot Game', 'E2E Soon Game']) {
      const row = page.locator(`[data-game="${title}"]`);
      await row.locator('[data-row-delete]').click();
      await row.locator('[data-row-delete-yes]').click();
      await expect(row).toHaveCount(0);
    }
  });
});
