import { expect, test } from '@playwright/test';

/**
 * Receipt layout under print rules (print media emulation). A real thermal printer still has to be
 * tried by hand: Chrome print dialog -> Margins "None", Headers and footers off, Scale 100%.
 *
 * Needs at least one bill (run after checkout.spec.ts) and the staff test account in web/.env.e2e.
 */
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];

test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD in web/.env.e2e');

const MM = 96 / 25.4; // CSS pixels per millimetre

test('the receipt fits 80 mm and 58 mm paper and is the only thing printed', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/counter\/stations/);

  // open the newest bill and press Print (the print dialog itself does nothing in headless Chrome)
  await page.getByRole('link', { name: 'Bills' }).click();
  const first = page.locator('[data-bills] li').first();
  await first.locator('button[aria-expanded]').click();
  await first.locator('[data-print]').click();
  const receipt = page.locator('[data-receipt]');
  await expect(receipt).toBeAttached();

  // on screen the receipt is hidden
  await expect(receipt).toBeHidden();

  // under print rules it is the only thing shown
  await page.emulateMedia({ media: 'print' });
  await expect(receipt).toBeVisible();
  await expect(page.locator('app-root > header')).toBeHidden();
  await expect(page.locator('app-root > main')).toBeHidden();

  for (const [cls, widthMm] of [
    ['receipt-80', 80],
    ['receipt-58', 58],
  ] as const) {
    await receipt.evaluate((el, c) => {
      el.classList.remove('receipt-58', 'receipt-80');
      el.classList.add(c);
    }, cls);

    const box = await receipt.boundingBox();
    expect(Math.abs(box!.width - widthMm * MM), `${cls} width`).toBeLessThan(1.5);

    // nothing sticks out of the paper: every element lies inside the receipt and none overflows sideways
    const overflow = await receipt.evaluate((el) => {
      const outer = el.getBoundingClientRect();
      const bad: string[] = [];
      el.querySelectorAll('*').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.right > outer.right + 0.5 || r.left < outer.left - 0.5) bad.push(n.tagName + ':' + (n.textContent ?? '').slice(0, 30));
        if ((n as HTMLElement).scrollWidth > (n as HTMLElement).clientWidth + 1) bad.push('scroll:' + (n.textContent ?? '').slice(0, 30));
      });
      return bad;
    });
    expect(overflow, `${cls} overflow`).toEqual([]);

    // nothing else takes up space on the printed page: the receipt is the only visible child of the app
    const visibleSiblings = await page.evaluate(() =>
      [...(document.querySelector('app-root')?.children ?? [])]
        .filter((c) => c.tagName !== 'APP-RECEIPT' && getComputedStyle(c).display !== 'none')
        .map((c) => c.tagName),
    );
    expect(visibleSiblings, `${cls} other visible content`).toEqual([]);
  }
});
