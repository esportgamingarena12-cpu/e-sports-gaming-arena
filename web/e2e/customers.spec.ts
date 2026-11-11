import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * The staff Customers screen, end to end against the real app and the dev database.
 *
 * Needs the staff, admin and customer test accounts in web/.env.e2e. Creates a counter customer
 * "E2E Cust Alpha" with a booking and a pass, and a pass type "E2E Cust Pass": remove test data afterwards.
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
const NAME = 'E2E Cust Alpha';
const PHONE = '9888800077';

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const tomorrow = addDays(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), 1);

async function token(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(res.ok(), `sign-in as ${email}`).toBeTruthy();
  return ((await res.json()) as { access_token: string }).access_token;
}

async function login(page: Page, email: string, password: string, home: RegExp): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(home);
}

test('set up a customer with a booking and a pass', async ({ request }) => {
  const t = await token(request, adminEmail!, adminPassword!);
  const h = { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };

  // already set up by an earlier run: leave it as it is
  const found = await request.post(`${SB}/rest/v1/rpc/customer_list`, { headers: h, data: { p_search: PHONE } });
  if (((await found.json()) as unknown[]).length > 0) return;

  // a pass type, if it is not there yet
  const have = await request.get(`${SB}/rest/v1/pass_types?select=id&name=eq.${encodeURIComponent('E2E Cust Pass')}`, { headers: h });
  let typeId = ((await have.json()) as { id: number }[])[0]?.id;
  if (!typeId) {
    const made = await request.post(`${SB}/rest/v1/pass_types`, {
      headers: { ...h, Prefer: 'return=representation' },
      data: { name: 'E2E Cust Pass', price: 100, validity_days: 7, station_type: 'pc', kind: 'unlimited' },
    });
    expect(made.ok()).toBeTruthy();
    typeId = ((await made.json()) as { id: number }[])[0].id;
  }

  const booking = await request.post(`${SB}/rest/v1/rpc/create_booking`, {
    headers: h,
    data: {
      p_station_type: 'pc',
      p_start: new Date(`${tomorrow}T15:00:00+05:30`).toISOString(),
      p_slots: 2,
      p_name: NAME,
      p_phone: PHONE,
      p_channel: 'phone',
    },
  });
  expect(booking.ok(), await booking.text()).toBeTruthy();

  const sold = await request.post(`${SB}/rest/v1/rpc/sell_pass`, {
    headers: h,
    data: { p_pass_type: typeId, p_name: NAME, p_phone: PHONE, p_email: null, p_payments: [{ mode: 'cash', amount: 100 }] },
  });
  expect(sold.ok(), await sold.text()).toBeTruthy();
});

test('staff find the customer by name or phone and see the whole picture', async ({ page }) => {
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  await page.goto('/counter/customers');
  const list = page.locator('[data-customers]');
  await expect(list.locator(`[data-customer="${NAME}"]`)).toBeVisible();

  await page.locator('[data-search]').fill('e2e cust alp');
  await expect(list.locator('[data-customer]')).toHaveCount(1);
  await page.locator('[data-search]').fill('98888 0007'); // a part of the number, with a space
  await expect(list.locator('[data-customer]')).toHaveCount(1);
  await expect(list.locator('[data-badge-pass]')).toBeVisible();
  await page.locator('[data-search]').fill('zzzz-nobody');
  await expect(page.locator('[data-none]')).toBeVisible();
  await page.locator('[data-search]').fill(PHONE);

  await list.locator(`[data-customer="${NAME}"]`).click();
  await expect(page.locator('[data-name]')).toHaveText(NAME);
  await expect(page.locator('[data-counts]')).toContainText('Bookings');
  await expect(page.locator('[data-spent]')).toHaveText('₹100.00'); // the pass bill
  await expect(page.locator('[data-passes]')).toContainText('E2E Cust Pass');
  await expect(page.locator('[data-passes]')).toContainText('Unlimited');
  await expect(page.locator('[data-bookings]')).toContainText('PC');
  await expect(page.locator('[data-bills]')).toContainText('pass');
});

test('a staff note is kept, and customers can never read it', async ({ page, request }) => {
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  await page.goto('/counter/customers');
  await page.locator('[data-search]').fill(PHONE);
  await page.locator(`[data-customer="${NAME}"]`).click();
  await page.locator('[data-edit-notes]').fill('Prefers PS5, pays by UPI');
  await page.locator('[data-save]').click();
  await expect(page.getByText('Saved')).toBeVisible();

  await page.reload();
  await page.locator('[data-search]').fill(PHONE);
  await page.locator(`[data-customer="${NAME}"]`).click();
  await expect(page.locator('[data-edit-notes]')).toHaveValue('Prefers PS5, pays by UPI');

  // a bad phone number is refused with a clear message
  await page.locator('[data-edit-phone]').fill('12');
  await page.locator('[data-save]').click();
  await expect(page.locator('[data-edit-phone]')).toHaveValue('12'); // not saved
  await expect(page.locator('label:has([data-edit-phone]) app-field-error')).toBeVisible();

  // a customer who signed in cannot read the note column, nor list customers
  const t = await token(request, 'e2e.customer1@example.com', customerPassword!);
  const h = { apikey: KEY, Authorization: `Bearer ${t}` };
  expect((await request.get(`${SB}/rest/v1/customers?select=notes`, { headers: h })).ok()).toBeFalsy();
  expect((await request.post(`${SB}/rest/v1/rpc/customer_list`, { headers: { ...h, 'Content-Type': 'application/json' }, data: {} })).ok()).toBeFalsy();
});

test('book for this customer and sell a pass start with the customer filled in', async ({ page }) => {
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  await page.goto('/counter/customers');
  await page.locator('[data-search]').fill(PHONE);
  await page.locator(`[data-customer="${NAME}"]`).click();

  await page.locator('[data-book-for]').click();
  await expect(page).toHaveURL(/\/counter\/bookings\?/);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-name]')).toHaveValue(NAME);
  await expect(dialog.locator('[data-phone]')).toHaveValue(PHONE);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/counter/customers');
  await page.locator('[data-search]').fill(PHONE);
  await page.locator(`[data-customer="${NAME}"]`).click();
  await page.locator('[data-sell-pass]').click();
  await expect(page).toHaveURL(/\/counter\/passes\?/);
  await expect(page.locator('[data-sell] [data-name]')).toHaveValue(NAME);
  await expect(page.locator('[data-sell] [data-phone]')).toHaveValue(PHONE);
});

test('no sideways scrolling at 360 px, list and detail', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, staffEmail!, staffPassword!, /\/counter\/stations/);
  await page.goto('/counter/customers');
  await expect(page.locator(`[data-customer="${NAME}"]`)).toBeVisible();
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await over()).toBeLessThanOrEqual(0);
  await page.locator(`[data-customer="${NAME}"]`).click();
  await expect(page.locator('[data-name]')).toBeVisible();
  await expect(page.locator('[data-list-pane]')).toBeHidden(); // on a phone the detail replaces the list
  expect(await over()).toBeLessThanOrEqual(0);
  await page.locator('[data-back]').click();
  await expect(page.locator('[data-list-pane]')).toBeVisible();
});
