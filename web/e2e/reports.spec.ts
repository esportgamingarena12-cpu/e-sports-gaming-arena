import { APIRequestContext, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { environment } from '../src/environments/environment.development';

/**
 * Dashboard, reports and the staff Today screen against the real app and the dev database.
 *
 * Needs, in web/.env.e2e: the staff account (E2E_EMAIL, E2E_PASSWORD) and an admin account
 * (E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD). Run after checkout.spec.ts so there is a bill today
 * (the checks also hold with no bills: everything is then 0).
 */
const staffEmail = process.env['E2E_EMAIL'];
const staffPassword = process.env['E2E_PASSWORD'];
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];

test.skip(!staffEmail || !staffPassword || !adminEmail || !adminPassword, 'Set the staff and admin test accounts in web/.env.e2e');
test.describe.configure({ mode: 'serial' });

const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;

async function token(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(res.ok(), `sign-in as ${email}`).toBeTruthy();
  return ((await res.json()) as { access_token: string }).access_token;
}

const money = (s: string): number => Number(s.replace(/[^\d.]/g, ''));

async function login(page: import('@playwright/test').Page, email: string, password: string, home: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(home);
}

test('dashboard totals equal the paid bills of today, and match the reports screen', async ({ page, request }) => {
  const t = await token(request, adminEmail!, adminPassword!);
  const istMidnight = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00+05:30`).toISOString();
  const res = await request.get(`${SB}/rest/v1/bills?select=total&status=eq.paid&created_at=gte.${encodeURIComponent(istMidnight)}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${t}` },
  });
  const paid = ((await res.json()) as { total: number }[]).reduce((a, b) => a + Number(b.total), 0);

  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  await expect(page.locator('[data-net]')).toBeVisible();
  expect(money((await page.locator('[data-net]').textContent())!)).toBeCloseTo(paid, 2);

  // the three payment modes add up to the net sales
  const modes = ['cash', 'upi', 'card'];
  let sum = 0;
  for (const m of modes) sum += money((await page.locator(`[data-${m}]`).textContent())!);
  expect(sum).toBeCloseTo(paid, 2);

  // the other widgets are there
  for (const sel of ['[data-occupancy]', '[data-bookings]', '[data-low-stock]', '[data-trend]', '[data-busy]']) {
    await expect(page.locator(sel)).toBeVisible();
  }
  await expect(page.locator('[data-trend] polyline')).toHaveCount(2);
  await expect(page.locator('[data-busy] rect').first()).toBeAttached();

  await page.getByRole('link', { name: 'Reports' }).first().click();
  await expect(page).toHaveURL(/\/admin\/reports/);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('[data-range]')).toBeVisible();
  expect(money((await page.locator('[data-net]').textContent())!)).toBeCloseTo(paid, 2);
});

test('the CSV has a byte order mark, the right columns and the report totals', async ({ page }) => {
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  await page.goto('/admin/reports');
  await page.getByRole('button', { name: 'This month' }).click();
  await expect(page.locator('[data-range]')).toBeVisible();
  const net = money((await page.locator('[data-net]').textContent())!);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-csv]').click()]);
  expect(download.suggestedFilename()).toMatch(/^sales-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);
  const bytes = readFileSync((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM, so Excel shows ₹ correctly
  const lines = bytes.toString('utf8').slice(1).split('\r\n');
  expect(lines[0]).toBe('Date,Bills,Gaming (₹),Canteen (₹),Discounts (₹),Net sales (₹),Void bills');
  const total = lines.find((l) => l.startsWith('TOTAL,'))!;
  expect(total).toBeTruthy();
  expect(Number(total.split(',')[5])).toBeCloseTo(net, 2);
  expect(lines).toContain('Payment mode,Amount (₹)');

  // a bad range is refused on screen
  await page.locator('[data-from]').fill('2026-12-31');
  await page.locator('[data-to]').fill('2026-01-01');
  await page.locator('[data-run]').click();
  await expect(page.locator('[data-error]')).toContainText('must not be after');
});

test('staff see only today; the admin screens and functions stay closed to them', async ({ page, request }) => {
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page).toHaveURL(/\/counter\/today/);
  await expect(page.locator('[data-net]')).toBeVisible();

  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin/); // sent back to the counter

  const t = await token(request, staffEmail!, staffPassword!);
  for (const fn of ['dashboard_today', 'sales_trend', 'busy_hours']) {
    const r = await request.post(`${SB}/rest/v1/rpc/${fn}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(r.ok(), `${fn} must be refused for staff`).toBeFalsy();
  }
  const range = await request.post(`${SB}/rest/v1/rpc/sales_report`, {
    headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    data: { p_from: '2026-01-01', p_to: '2026-01-02' },
  });
  expect(range.ok()).toBeFalsy();
});

test('no sideways scrolling at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, adminEmail!, adminPassword!, /\/admin$/);
  for (const path of ['/admin', '/admin/reports']) {
    await page.goto(path);
    await expect(page.locator('[data-net]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(w.scroll, `${path} overflows`).toBeLessThanOrEqual(w.inner);
  }
});
