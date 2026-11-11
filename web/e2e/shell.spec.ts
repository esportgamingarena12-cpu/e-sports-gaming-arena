import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * The new look: top bar, sidebar names, search, bell, user menu, landing page links and the revenue chart.
 * Needs the staff and admin test accounts in web/.env.e2e. Creates a counter customer "E2E Shell Cust".
 */
const staffEmail = process.env['E2E_EMAIL'];
const staffPassword = process.env['E2E_PASSWORD'];
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];

test.skip(!staffEmail || !adminEmail, 'Set the staff and admin test accounts in web/.env.e2e');
test.describe.configure({ mode: 'serial' });

const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;
const NAME = 'E2E Shell Cust';
const PHONE = '9888800099';

async function login(page: Page, email: string, password: string, home: RegExp): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(home);
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    data: { email: adminEmail, password: adminPassword },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { access_token: string }).access_token;
}

test('a counter customer to search for', async ({ request }) => {
  const h = { apikey: KEY, Authorization: `Bearer ${await adminToken(request)}`, 'Content-Type': 'application/json' };
  const found = await request.post(`${SB}/rest/v1/rpc/customer_list`, { headers: h, data: { p_search: PHONE } });
  if (((await found.json()) as unknown[]).length > 0) return;
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const made = await request.post(`${SB}/rest/v1/rpc/create_booking`, {
    headers: h,
    data: { p_station_type: 'pc', p_start: new Date(`${tomorrow}T17:00:00+05:30`).toISOString(), p_slots: 2, p_name: NAME, p_phone: PHONE, p_channel: 'phone' },
  });
  expect(made.ok(), await made.text()).toBeTruthy();
});

test('visitors get the section links, Login and Book a Slot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/book');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const l of ['Home', 'The Studio', 'Plans', 'Book']) await expect(nav.getByRole('link', { name: l, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.locator('[data-top-book]')).toBeVisible();
  await expect(page.locator('[data-hero-book]')).toBeVisible();

  await nav.getByRole('link', { name: 'The Studio', exact: true }).click();
  await expect(page).toHaveURL(/#studio$/);
  await expect(page.locator('#studio')).toBeInViewport();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/book\/login/);
});

test('the owner sees the mockup names, can search, and has a bell and a user menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  const side = page.getByRole('complementary', { name: 'Main menu' });
  for (const l of ['Dashboard', 'Reports & Analytics', 'Gaming Systems', 'Bookings', 'Canteen', 'Billing & Payments', 'Inventory', 'Customers', 'Memberships', 'Staff Management']) {
    await expect(side.getByRole('link', { name: l, exact: true })).toBeVisible();
  }

  // Ctrl + K focuses the search; a name finds the customer and opens them
  await page.keyboard.press('Control+k');
  await expect(page.locator('[data-search-box]')).toBeFocused();
  await page.locator('[data-search-box]').fill('E2E Shell');
  await page.locator(`[data-hit="${NAME}"]`).click();
  await expect(page).toHaveURL(/\/counter\/customers\?open=\d+/);
  await expect(page.locator('[data-name]')).toHaveText(NAME);

  // the bell opens a panel (alerts depend on the data, so only the panel itself is checked)
  await page.locator('[data-bell]').click();
  await expect(page.locator('[data-bell-panel]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-bell-panel]')).toBeHidden();

  // user menu: initials, name and Logout
  await expect(page.locator('[data-user-menu]')).toContainText('Owner');
  await page.locator('[data-user-menu]').click();
  await page.locator('[data-logout]').click();
  await expect(page).toHaveURL(/\/login/);
});

test('the revenue chart can show a week, 7 days or 30 days', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  const card = page.locator('[data-trend]');
  await expect(card.locator('[data-line]')).toBeAttached();
  const week = await card.locator('[data-line]').getAttribute('d');
  await card.locator('[data-range]').selectOption('last30');
  await expect(card.locator('[data-trend-total]')).toBeVisible();
  await expect.poll(async () => card.locator('[data-line]').getAttribute('d')).not.toBe(week);
  await card.locator('[data-range]').selectOption('last7');
  await expect(card.locator('svg text').filter({ hasText: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/ })).toHaveCount(7);
  await expect(page.locator('[data-station-grid] [data-state]').first()).toBeVisible();
});

test('on a phone the bottom bar is short and the menu has the full names', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  const bar = page.getByRole('navigation', { name: 'Quick links' });
  for (const l of ['Stations', 'Bookings', 'Canteen', 'Bills']) await expect(bar.getByRole('link', { name: l, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.getByRole('complementary', { name: 'Main menu' });
  await expect(drawer.getByRole('link', { name: 'Gaming Systems', exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Memberships', exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Customers', exact: true })).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});
