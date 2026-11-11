import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * Prepaid passes, end to end against the real app and the dev database:
 * the admin sets up passes, the counter sells one, a session runs on it for free,
 * a customer who signed in sees their pass, and the reports add up.
 *
 * Needs the staff, admin and customer test accounts in web/.env.e2e. Creates two pass types
 * ("E2E Weekly PC", "E2E 2 Hours") that stay behind: remove test data from the dev project afterwards.
 */
const staffEmail = process.env['E2E_EMAIL'];
const staffPassword = process.env['E2E_PASSWORD'];
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
const customerPassword = process.env['E2E_CUSTOMER_PASSWORD'];

test.skip(!staffEmail || !adminEmail || !customerPassword, 'Set the staff, admin and customer test accounts in web/.env.e2e');
test.describe.configure({ mode: 'serial' });

const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SB).hostname.split('.')[0]}-auth-token`;
const money = (s: string): number => Number(s.replace(/[^\d.]/g, ''));

async function login(page: Page, email: string, password: string, home: RegExp): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(home);
}

async function customerTokens(request: APIRequestContext, n: number): Promise<{ access_token: string }> {
  const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    data: { email: `e2e.customer${n}@example.com`, password: customerPassword },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { access_token: string };
}

async function sell(page: Page, passName: string, name: string, phone: string, email = ''): Promise<void> {
  await page.goto('/counter/passes');
  const value = await page.locator('[data-type] option', { hasText: passName }).first().getAttribute('value');
  await page.locator('[data-type]').selectOption(value!);
  await page.locator('[data-name]').fill(name);
  await page.locator('[data-phone]').fill(phone);
  if (email) {
    await page.locator('details summary').click();
    await page.locator('[data-email]').fill(email);
  }
  await expect(page.locator('[data-status]')).toContainText('matches'); // all cash by default
  await page.locator('[data-sell-btn]').click();
  await expect(page.locator('[data-sold]')).toContainText('Pass sold');
}

test('the admin sets up two passes', async ({ page }) => {
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  await page.goto('/admin/passes');
  const make = async (name: string, price: string, days: string, kind: 'unlimited' | 'hours', hours?: string) => {
    if (await page.locator(`[data-pass="${name}"]`).count()) return; // re-run
    await page.locator('[data-new]').click();
    await page.locator('[data-name]').fill(name);
    await page.locator('[data-price]').fill(price);
    await page.locator('[data-days]').fill(days);
    await page.locator('[data-games]').selectOption('pc');
    await page.locator('[data-kind]').selectOption(kind);
    if (hours) await page.locator('[data-hours]').fill(hours);
    await page.locator('[data-save]').click();
    await expect(page.locator(`[data-pass="${name}"]`)).toBeVisible();
  };
  await make('E2E Weekly PC', '100', '7', 'unlimited');
  await make('E2E 2 Hours', '80', '30', 'hours', '2');
  await expect(page.locator('[data-pass="E2E 2 Hours"]')).toContainText('2 h');
  await expect(page.locator('[data-pass="E2E Weekly PC"]')).toContainText('unlimited play');
});

test('the counter sells a pass, a session runs on it for free, and the bill says so', async ({ page }) => {
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  await sell(page, 'E2E Weekly PC', 'E2E Pass Cust', '9888800001');
  await expect(page.locator('[data-sold-pass]').first()).toContainText('E2E Pass Cust');
  await expect(page.locator('[data-sold-pass]').first().locator('[data-state]')).toHaveText('active');

  // start PC 1 on the pass, found by phone number
  await page.goto('/counter/stations');
  const card = page.locator('li[data-station="PC 1"]');
  await expect(card).toContainText('Available');
  await card.getByRole('button', { name: 'Start' }).click();
  await page.locator('[data-lookup-phone]').fill('98888 00001');
  await page.locator('[data-lookup]').click();
  await expect(page.locator('[data-pass-radio]').first()).toBeChecked();
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(card).toContainText('Running');
  await expect(card.locator('[data-pass-note]')).toContainText('E2E Weekly PC pass');
  await expect(card.locator('[data-charge]')).toHaveText('₹0.00');

  // the bill is free, with the pass named on the gaming line
  await card.getByRole('button', { name: 'Bill' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-total]')).toHaveText('₹0.00');
  await dialog.locator('[data-confirm]').click();
  await expect(card).toContainText('Available');
  await page.goto('/counter/bills');
  const first = page.locator('[data-bills] li').first();
  await first.locator('button[aria-expanded]').click();
  await expect(first).toContainText('E2E Weekly PC pass');
});

test('a customer who signed in sees the pass sold to their email, and no one else does', async ({ page, request, browser }) => {
  const t1 = await customerTokens(request, 1);
  const prof = await request.post(`${SB}/rest/v1/rpc/save_my_profile`, {
    headers: { apikey: KEY, Authorization: `Bearer ${t1.access_token}`, 'Content-Type': 'application/json' },
    data: { p_name: 'E2E One', p_phone: '9000000001' },
  });
  expect(prof.ok()).toBeTruthy();

  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  await sell(page, 'E2E 2 Hours', 'E2E One', '9000000001', 'e2e.customer1@example.com');

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cust = await ctx.newPage();
  const tokens = await customerTokens(request, 1);
  await cust.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(tokens)]);
  await cust.goto('/book/my-bookings');
  const mine = cust.locator('[data-my-pass]');
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText('E2E 2 Hours');
  await expect(mine).toContainText('2 h left');
  await ctx.close();

  // another customer sees none of it
  const t2 = await customerTokens(request, 2);
  const theirs = await request.post(`${SB}/rest/v1/rpc/my_passes`, {
    headers: { apikey: KEY, Authorization: `Bearer ${t2.access_token}`, 'Content-Type': 'application/json' },
    data: {},
  });
  expect(await theirs.json()).toEqual([]);
});

test('staff can sell but not set up or cancel; the figures add up', async ({ page }) => {
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  await page.goto('/admin/passes');
  await expect(page).not.toHaveURL(/\/admin/); // sent back to the counter
  await page.goto('/counter/passes');
  await expect(page.locator('[data-sell]')).toBeVisible();
  await expect(page.locator('[data-cancel]')).toHaveCount(0);
  await page.goto('/counter/today');
  await expect(page.locator('[data-net]')).toBeVisible();
  const net = money((await page.locator('[data-net]').textContent())!);
  const parts = ['gaming', 'canteen', 'passes'].reduce(async (acc, k) => (await acc) + money((await page.locator(`[data-${k}]`).textContent())!), Promise.resolve(0));
  const discounts = money((await page.locator('[data-discounts]').textContent())!);
  expect(net).toBeCloseTo((await parts) - discounts, 2);
  expect(money((await page.locator('[data-passes]').textContent())!)).toBeGreaterThanOrEqual(180);
});

test('the owner sees active passes on the dashboard and can cancel one', async ({ page }) => {
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  await expect(page.locator('[data-active-passes]')).toContainText(/[1-9]\d* active pass/);
  await page.goto('/counter/passes');
  const row = page.locator('[data-sold-pass]').filter({ hasText: 'E2E 2 Hours' }).first();
  await row.locator('[data-cancel]').click();
  await row.locator('[data-reason]').fill('e2e test');
  await row.locator('[data-cancel-yes]').click();
  await expect(row.locator('[data-state]')).toHaveText('cancelled');
});

test('no sideways scrolling at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  for (const path of ['/counter/passes', '/admin/passes']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(w.scroll, `${path} overflows`).toBeLessThanOrEqual(w.inner);
  }
});
