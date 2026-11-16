import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * Phase 18: the home page (games, rate card, opening hours), pass discounts, food photos with delete, and the
 * time-up pop-up. The public checks need nothing. The admin checks need the admin test account in web/.env.e2e
 * and clean up after themselves (rows named "E2E ...").
 */
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;

test.describe('public home page', () => {
  test('shows the games, the rate card and the opening hours from the shop data', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    await expect(page.locator('[data-games]')).toContainText('Games available in');
    await expect(page.locator('[data-games]')).toContainText('PC');
    await expect(page.locator('[data-games]')).toContainText('PS5');

    const card = page.locator('[data-rate-card]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('30 Minutes');
    await expect(card).toContainText('1 Hour');
    await expect(card.locator('[data-rate-row]').first()).toContainText('₹');
    expect(await card.locator('[data-rate-row]').count()).toBeGreaterThanOrEqual(2);

    const hours = page.locator('[data-hours]');
    await expect(hours).toContainText('Mon – Fri');
    await expect(hours).toContainText('12:00 pm – 10:00 pm');
    await expect(hours).toContainText('Sat – Sun');
    await expect(hours).toContainText('11:00 am – 10:00 pm');
  });

  test('timings say whether the shop is open now and highlight today', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    const status = page.locator('[data-open-status]');
    await expect(status).toBeVisible();
    await expect(status).toHaveText(/Open now · closes 10:00 pm|Opens (today|tomorrow|[A-Z][a-z]{2}) at \d{1,2}:\d{2} (am|pm)/);
    await expect(page.locator('[data-today="true"]')).toHaveCount(1);
    await expect(page.locator('[data-today="true"]')).toContainText('Today');
  });

  test('the hourly prices are in the rate card only, not repeated as plan cards', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    await expect(page.locator('[data-plan*="by the hour"]')).toHaveCount(0);
    // the old "Plans" link is now "Rates" and jumps to the rate card
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Rates', exact: true }).click();
    await expect(page).toHaveURL(/#rates$/);
    await expect(page.locator('#rates')).toBeInViewport({ timeout: 15_000 });
  });

  test('the canteen is highlighted with a few items, not the whole menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    const canteen = page.locator('[data-canteen]');
    await expect(canteen).toBeVisible();
    await expect(canteen).toContainText('Canteen');
    const items = canteen.locator('[data-canteen-item]');
    expect(await items.count()).toBeGreaterThanOrEqual(1);
    expect(await items.count()).toBeLessThanOrEqual(6);
    await expect(items.first()).toContainText('₹');
    expect(await canteen.locator('[data-canteen-categories] li').count()).toBeGreaterThanOrEqual(1);
  });

  test('a game tile jumps to booking with that game chosen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    await page.locator('[data-game="PS5"]').click();
    await expect(page.locator('[data-type]')).toHaveValue('ps5');
  });

  for (const w of [360, 768, 1280]) {
    test(`the home page fits at ${w} px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/book');
      await expect(page.locator('[data-rate-card]')).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('admin and counter changes', () => {
  test.skip(!adminEmail || !adminPassword, 'Set the admin test account in web/.env.e2e');
  test.describe.configure({ mode: 'serial' });

  // The account in .env.e2e must exist in the project the app points at; if it does not, skip instead of failing.
  let adminOk = false;
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    adminOk = res.ok();
  });
  test.beforeEach(() => test.skip(!adminOk, 'The admin test account does not exist in this project yet'));

  async function login(page: Page): Promise<void> {
    await page.goto('/login');
    await page.getByLabel('Email').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }

  async function token(request: APIRequestContext): Promise<string> {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { access_token: string }).access_token;
  }

  const headers = (t: string) => ({ apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'return=representation' });

  test.afterAll(async ({ request }) => {
    if (!adminOk) return;
    const h = headers(await token(request));
    await request.delete(`${SB}/rest/v1/pass_types?name=like.E2E%25`, { headers: h });
    await request.delete(`${SB}/rest/v1/products?name=like.E2E%25`, { headers: h });
  });

  test('a discounted monthly pass and a daily pass show on the home page', async ({ page, request }) => {
    const h = headers(await token(request));
    const made = await request.post(`${SB}/rest/v1/pass_types`, {
      headers: h,
      data: [
        { name: 'E2E Monthly', price: 1600, original_price: 2000, validity_days: 30, kind: 'unlimited' },
        { name: 'E2E Daily', price: 150, validity_days: 1, kind: 'unlimited' },
      ],
    });
    expect(made.ok(), await made.text()).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/book');
    const monthly = page.locator('[data-plan="E2E Monthly"]');
    await expect(monthly.locator('[data-was]')).toHaveText('₹2000');
    await expect(monthly.locator('[data-save]')).toHaveText('Save 20%');
    await expect(monthly.locator('[data-price]')).toHaveText('₹1600');
    const daily = page.locator('[data-plan="E2E Daily"]');
    await expect(daily).toContainText('Subject to seat availability');
    await expect(daily.locator('[data-save]')).toHaveCount(0);
  });

  test('the admin can add a food item with a photo, then delete it', async ({ page }) => {
    // a 1x1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await page.goto('/admin/products');
    await page.locator('[data-new]').click();
    await page.locator('[data-name]').fill('E2E Photo Samosa');
    await page.locator('[data-price]').fill('15');
    await page.locator('[data-opening]').fill('5');
    await page.locator('[data-file]').setInputFiles({ name: 'samosa.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('[data-preview]')).toBeVisible();
    await page.locator('[data-save]').click();

    const row = page.locator('[data-product="E2E Photo Samosa"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-food-img]')).toBeVisible();

    // a non-image is refused
    await row.locator('[data-edit]').click();
    await page.locator('[data-file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.locator('[data-photo-error]')).toContainText('JPG, PNG or WebP');

    // never sold: delete removes it
    await page.locator('[data-delete]').click();
    await page.locator('[data-delete-yes]').click();
    await expect(page.locator('[data-product="E2E Photo Samosa"]')).toHaveCount(0);
  });

  test('time up: the pop-up appears with sound controls, and Extend dismisses it', async ({ page, request }) => {
    test.setTimeout(150_000);
    const t = await token(request);
    const h = headers(t);
    const stations = (await (await request.get(`${SB}/rest/v1/stations?select=id,name&active=eq.true&order=sort_order`, { headers: h })).json()) as { id: number; name: string }[];
    const open = (await (await request.get(`${SB}/rest/v1/sessions?select=station_id&status=in.(running,paused,ended)`, { headers: h })).json()) as { station_id: number }[];
    const taken = new Set(open.map((s) => s.station_id));
    const free = stations.find((s) => !taken.has(s.id));
    test.skip(!free, 'every station is in use');

    const started = await request.post(`${SB}/rest/v1/rpc/start_session`, { headers: h, data: { p_station: free!.id } });
    expect(started.ok(), await started.text()).toBeTruthy();
    const sessionId = Number(await started.json());
    try {
      const alarm = await request.post(`${SB}/rest/v1/rpc/set_session_alarm`, { headers: h, data: { p_session: sessionId, p_minutes: 1 } });
      expect(alarm.ok(), await alarm.text()).toBeTruthy();

      await page.setViewportSize({ width: 1280, height: 900 });
      await login(page);
      await page.goto('/counter/stations');
      await expect(page.locator(`[data-station="${free!.name}"] [data-timer-note]`)).toBeVisible();

      const popup = page.locator('[data-timeup]');
      await expect(popup).toBeVisible({ timeout: 100_000 });
      await expect(popup.locator(`[data-timeup-station="${free!.name}"]`)).toBeVisible();

      await popup.locator('[data-extend-15]').click();
      await expect(popup).toBeHidden();
    } finally {
      await request.post(`${SB}/rest/v1/rpc/cancel_session`, { headers: h, data: { p_session: sessionId } });
    }
  });
});
