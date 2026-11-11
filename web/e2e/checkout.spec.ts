import { expect, test } from '@playwright/test';

/**
 * Bill flow, end to end against the real app and the dev database:
 * a PC 3 Hours package session + 2 Maggi + 1 Coffee, discount ₹5, paid by split cash + UPI.
 *
 * Package ₹150 (inside its 3 hours) + 2 x ₹50 + ₹40 = ₹290, minus ₹5 = ₹285.
 * The 3 h 21 min overtime example (₹315) needs a session backdated in the database, which a
 * browser cannot do; it is covered by the database tests (02_checkout) and checked by hand.
 *
 * Needs a STAFF test account in web/.env.e2e (E2E_EMAIL, E2E_PASSWORD) and PC 3 free.
 * The test leaves one bill behind; remove test data from the dev project afterwards.
 */
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];

test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD in web/.env.e2e');

test('package + canteen items + discount, paid by cash and UPI', async ({ page }) => {
  // log in as staff
  await page.goto('/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/counter\/stations/);

  // start PC 3 on the 3 hours package
  const card = page.locator('li[data-station="PC 3"]');
  await expect(card).toContainText('Available');
  await card.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('dialog').getByLabel(/PC 3 Hours/).check();
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(card).toContainText('Running');

  // add 2 Maggi and 1 Coffee to its tab
  await card.getByRole('link', { name: '+ Items' }).click();
  await expect(page).toHaveURL(/canteen\?tab=/);
  await page.locator('[data-product="Maggi"]').click();
  await page.locator('[data-product="Maggi"]').click();
  await page.locator('[data-product="Coffee"]').click();
  await page.getByRole('button', { name: 'Add to tab' }).click();
  await expect(page.getByText('Added to tab')).toBeVisible();

  // bill it
  await page.getByRole('link', { name: 'Stations' }).click();
  await card.getByRole('button', { name: 'Bill' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-subtotal]')).toHaveText('₹290.00');

  await dialog.locator('[data-discount]').fill('5');
  await expect(dialog.locator('[data-total]')).toHaveText('₹285.00');
  await expect(dialog.locator('[data-confirm]')).toBeDisabled(); // nothing paid yet

  // 100 + 200 = 300 is too much: refused
  await dialog.locator('[data-cash]').fill('100');
  await dialog.locator('[data-upi]').fill('200');
  await expect(dialog.locator('[data-status]')).toContainText('Over by ₹15.00');
  await expect(dialog.locator('[data-confirm]')).toBeDisabled();

  // 85 + 200 = 285 matches
  await dialog.locator('[data-cash]').fill('85');
  await expect(dialog.locator('[data-status]')).toContainText('Payment matches total');
  await expect(dialog.locator('[data-confirm]')).toBeEnabled();

  // UPI part shows a QR when a UPI ID is set, or a clear message when it is not
  await expect(dialog.locator('[data-qr], [data-no-upi-id]').first()).toBeVisible();

  await dialog.locator('[data-confirm]').click();
  await expect(dialog.locator('[data-saved]')).toContainText('saved');
  const saved = await dialog.locator('[data-saved] h2').innerText();
  const billNo = saved.match(/#(\d+)/)![1];
  await dialog.getByRole('button', { name: 'Done' }).click();

  // it shows up on the Bills screen with the right total and modes
  await page.getByRole('link', { name: 'Bills' }).click();
  const row = page.locator(`li[data-bill="${billNo}"]`);
  await expect(row).toContainText('₹285.00');
  await expect(row).toContainText('Cash + UPI');
  await expect(page.locator('[data-void]')).toHaveCount(0); // staff cannot void
});
