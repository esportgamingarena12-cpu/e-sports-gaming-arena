import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * Customer portal, end to end against the real app and the dev database.
 *
 * Needs, in web/.env.e2e: the staff test account (E2E_EMAIL, E2E_PASSWORD) and the password shared by
 * three customer test accounts e2e.customer1..3@example.com (E2E_CUSTOMER_PASSWORD).
 * The email-code login itself is checked by hand (it needs a real mailbox); here the customers are
 * signed in with their password through the auth API and the session is handed to the page.
 *
 * Leaves bookings and customer records behind: remove test data from the dev project afterwards.
 */
const staffEmail = process.env['E2E_EMAIL'];
const staffPassword = process.env['E2E_PASSWORD'];
const customerPassword = process.env['E2E_CUSTOMER_PASSWORD'];

test.skip(!staffEmail || !staffPassword || !customerPassword, 'Set the staff and customer test accounts in web/.env.e2e');
test.describe.configure({ mode: 'serial' });

const SB_URL = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const tomorrow = addDays(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), 1);
const istMs = (day: string, hhmm: string): number => Date.parse(`${day}T${hhmm}:00+05:30`);

interface Tokens {
  access_token: string;
  [k: string]: unknown;
}

async function passwordLogin(request: APIRequestContext, n: number): Promise<Tokens> {
  const res = await request.post(`${SB_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    data: { email: `e2e.customer${n}@example.com`, password: customerPassword },
  });
  expect(res.ok(), `customer ${n} sign-in`).toBeTruthy();
  return (await res.json()) as Tokens;
}

/** Opens the page already signed in as test customer n. */
async function signedInAs(page: Page, request: APIRequestContext, n: number): Promise<Tokens> {
  const tokens = await passwordLogin(request, n);
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(tokens)]);
  return tokens;
}

async function rpc(request: APIRequestContext, tokens: Tokens | null, fn: string, body: object) {
  return request.post(`${SB_URL}/rest/v1/rpc/${fn}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${tokens?.access_token ?? KEY}`, 'Content-Type': 'application/json' },
    data: body,
  });
}

const slotButton = (page: Page, label: string) =>
  page.locator('[data-slots-grid] [data-slot]').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') });

const bookUrl = `/book?type=ps5&day=${tomorrow}&slots=2`;

test('anyone can see free times; signing in is asked only when booking', async ({ page }) => {
  await page.goto(bookUrl);
  await expect(page.locator('[data-slots-grid] [data-slot]').first()).toBeVisible();
  await slotButton(page, '6:00 pm').click();
  await expect(page.locator('[data-book]')).toHaveText(/Sign in to book/);
  await page.locator('[data-book]').click();
  await expect(page).toHaveURL(/\/book\/login\?next=/);
  // the private pages send a signed-out visitor to the login
  await page.goto('/book/my-bookings');
  await expect(page).toHaveURL(/\/book\/login/);
});

test('first booking: profile, PS5 6-7 pm tomorrow, visible on the counter within 2 s', async ({ page, request, browser }) => {
  await signedInAs(page, request, 1);

  // a staff screen already open on tomorrow's bookings
  const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const staff = await staffCtx.newPage();
  await staff.goto('/login');
  await staff.getByLabel('Email').fill(staffEmail!);
  await staff.getByLabel('Password').fill(staffPassword!);
  await staff.getByRole('button', { name: 'Sign in' }).click();
  await expect(staff).toHaveURL(/\/counter\/stations/);
  await staff.goto('/counter/bookings');
  await staff.locator('[data-date]').fill(tomorrow);
  await expect(staff.locator('[data-booking-list]')).toBeVisible();
  const before = await staff.locator('[data-booking-list] li[data-booking]').count();

  await page.goto(bookUrl);
  await slotButton(page, '6:00 pm').click();
  await page.locator('[data-book]').click();
  // no profile yet: asked for name and phone first, then returned to the same choice
  await expect(page).toHaveURL(/\/book\/profile\?next=/);
  await page.locator('[data-name]').fill('E2E One');
  await page.locator('[data-phone]').fill('9000000001');
  await page.locator('[data-save]').click();
  await expect(page).toHaveURL(/\/book\?type=ps5/);
  await expect(page.locator('[data-confirm]')).toContainText('6:00 pm');

  await page.locator('[data-book]').click();
  const t0 = Date.now();
  await expect(page).toHaveURL(/\/book\/my-bookings/);
  await expect(page.locator('[data-booking]')).toHaveCount(1);

  await expect(staff.locator('[data-booking-list] li[data-booking]')).toHaveCount(before + 1, { timeout: 2000 });
  console.log(`booking appeared on the counter ${Date.now() - t0} ms after the customer confirmed`);
  await expect(staff.locator('[data-booking-list]')).toContainText('E2E One');
  await staffCtx.close();
});

test('change the time, then cancel', async ({ page, request }) => {
  await signedInAs(page, request, 1);
  await page.goto('/book/my-bookings');
  const card = page.locator('[data-booking]').first();
  await expect(card).toContainText('6:00 pm');

  await card.locator('[data-change]').click();
  await card.locator('[data-change-day]').fill(tomorrow);
  const seven = card.locator('[data-move]').filter({ hasText: /^\s*7:00 pm\s*$/ });
  await expect(seven).toBeVisible();
  await seven.click();
  await expect(page.locator('[data-notice]')).toContainText('Moved to');
  await expect(page.locator('[data-booking]').first()).toContainText('7:00 pm');

  await page.locator('[data-booking]').first().locator('[data-cancel]').click();
  await page.locator('[data-cancel-yes]').click();
  await expect(page.locator('[data-notice]')).toContainText('cancelled');
  await expect(page.locator('[data-none]')).toBeVisible();
  await expect(page.locator('[data-past]').first()).toContainText('Cancelled');
});

test('the last free station goes to the first person; the other is told and sees what is left', async ({ page, request }) => {
  const day = addDays(tomorrow, 1);
  const slot = istMs(day, '20:00');
  const t2 = await passwordLogin(request, 2);
  const t3 = await passwordLogin(request, 3);
  for (const [t, n] of [[t2, 2], [t3, 3]] as const) {
    const r = await rpc(request, t, 'save_my_profile', { p_name: `E2E ${n}`, p_phone: `900000000${n}` });
    expect(r.ok(), `profile ${n}`).toBeTruthy();
  }
  const start = new Date(slot).toISOString();
  expect((await rpc(request, t2, 'create_booking', { p_station_type: 'ps5', p_start: start, p_slots: 2 })).ok()).toBeTruthy();

  // customer 3 is looking at 8:00 pm with one station left
  await signedInAs(page, request, 3);
  await page.goto(`/book?type=ps5&day=${day}&slots=2`);
  await slotButton(page, '8:00 pm').click();

  // meanwhile customer 1 takes the last one
  const t1 = await passwordLogin(request, 1);
  expect((await rpc(request, t1, 'create_booking', { p_station_type: 'ps5', p_start: start, p_slots: 2 })).ok()).toBeTruthy();

  await page.locator('[data-book]').click();
  await expect(page.locator('[data-error]')).toContainText(/just taken/i);
  await expect(slotButton(page, '8:00 pm')).toHaveCount(0);
  await expect(page.locator('[data-slots-grid] [data-slot]').first()).toBeVisible(); // the rest is still offered
  await expect(page).toHaveURL(/\/book\?/); // no booking was made
});

test('customers can only reach their own data', async ({ request }) => {
  const t1 = await passwordLogin(request, 1);
  const get = (path: string, tokens: Tokens | null) =>
    request.get(`${SB_URL}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${tokens?.access_token ?? KEY}` },
    });

  // closed tables show nothing
  for (const table of ['stations', 'bills', 'payments', 'sessions', 'products', 'stock_movements']) {
    const r = await get(`${table}?select=*`, t1);
    const body = r.ok() ? ((await r.json()) as unknown[]) : [];
    expect(body, `${table} must be empty for a customer`).toEqual([]);
  }

  // bookings: only their own
  const mine = (await (await get('bookings?select=id,customer_id', t1)).json()) as { customer_id: number }[];
  const customers = (await (await get('customers?select=id', t1)).json()) as { id: number }[];
  expect(customers).toHaveLength(1);
  expect(mine.every((b) => b.customer_id === customers[0].id)).toBeTruthy();

  // no direct writes
  const ins = await request.post(`${SB_URL}/rest/v1/bookings`, {
    headers: { apikey: KEY, Authorization: `Bearer ${t1.access_token}`, 'Content-Type': 'application/json' },
    data: { customer_id: customers[0].id, station_type: 'ps5', station_id: 1, start_at: new Date().toISOString(), end_at: new Date().toISOString(), slots: 1, channel: 'online' },
  });
  expect(ins.ok()).toBeFalsy();
  const upd = await request.patch(`${SB_URL}/rest/v1/bookings?id=gte.0`, {
    headers: { apikey: KEY, Authorization: `Bearer ${t1.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: { status: 'completed' },
  });
  expect(upd.ok() ? await upd.json() : []).toEqual([]);

  // a visitor with no login cannot read bills, bookings or the customer list
  expect((await rpc(request, null, 'my_bills', {})).ok()).toBeFalsy();
  for (const table of ['bookings', 'customers', 'bills']) {
    const r = await get(`${table}?select=*`, null);
    expect(r.ok() ? await r.json() : []).toEqual([]);
  }
  // but the public booking facts work
  const info = await rpc(request, null, 'booking_info', {});
  expect(info.ok()).toBeTruthy();
  expect(((await info.json()) as { types: string[] }).types).toContain('ps5');
});

test('no sideways scrolling at 360 px', async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signedInAs(page, request, 2);
  for (const path of [bookUrl, '/book/my-bookings', '/book/profile']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(w.scroll, `${path} overflows`).toBeLessThanOrEqual(w.inner);
  }
});
