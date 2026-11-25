import { expect, test } from '@playwright/test';

/** The public home page menu on a phone: a card over the page (the page does not move), closed by Escape, a tap outside, or a link. */
test.describe('public menu on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('opens over the page without moving it, and shows the links with Login and Book a Slot', async ({ page }) => {
    await page.goto('/book');
    const before = await page.locator('main').evaluate((m) => m.getBoundingClientRect().top);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.locator('[data-public-menu]');
    await expect(menu).toBeVisible();
    for (const t of ['Home', 'The Studio', 'Rates', 'Book']) await expect(menu.getByRole('link', { name: t, exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: /Book a Slot/ })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await expect(menu.locator('[data-menu-staff-login]')).toBeVisible();
    expect(await page.locator('main').evaluate((m) => m.getBoundingClientRect().top)).toBe(before);
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
  });

  test('Escape, a tap outside, and choosing a link all close it', async ({ page }) => {
    await page.goto('/book');
    const open = () => page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.locator('[data-public-menu]');

    await open();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await open();
    await page.locator('[data-menu-backdrop]').click({ position: { x: 20, y: 600 } });
    await expect(menu).toHaveCount(0);

    await open();
    await menu.getByRole('link', { name: 'Rates', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/#rates$/);
  });
});

/** The top bar on a computer: the link for the part of the page on screen is highlighted. */
test.describe('top bar on a computer', () => {
  test.use({ viewport: { width: 1440, height: 800 } });

  test('Home is lit at the top, and the section links light up as you scroll', async ({ page }) => {
    await page.goto('/book');
    const nav = page.locator('[data-main-nav]');
    const lit = () => nav.locator('[data-active="true"]').allInnerTexts();
    await expect.poll(lit).toEqual(['Home']);
    await page.locator('#rates').waitFor(); // the rates section appears once the shop's data has loaded
    await page.evaluate(() => document.getElementById('rates')!.scrollIntoView());
    await expect.poll(lit).toEqual(['Rates']);
    await page.evaluate(() => document.getElementById('studio')!.scrollIntoView());
    await expect.poll(lit).toEqual(['The Studio']);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(lit).toEqual(['Home']);
    await expect(page.locator('[data-top-login]')).toBeVisible();
    await expect(page.locator('[data-top-book]')).toBeVisible();
  });
});
