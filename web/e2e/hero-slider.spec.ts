import { expect, Page, test } from '@playwright/test';

/**
 * The home page slider: slide 1 is the welcome hero, then Games available, Timings and Canteen (the last three come
 * from the shop's data and are left out when there is nothing to show). Needs nothing but the public page.
 */
async function open(page: Page, width = 1280): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/book');
  await expect(page.locator('[data-slide-welcome]')).toBeAttached();
  // the other slides arrive with the shop data
  await expect(page.locator('[data-slide]')).toHaveCount(4);
}

const activeIndex = async (page: Page): Promise<number> =>
  Number(await page.locator('[data-slide][data-active="true"]').getAttribute('data-slide'));

test.describe('home page slider', () => {
  test('the four slides are in the order welcome, games, timings, canteen', async ({ page }) => {
    await open(page);
    expect(await page.locator('[data-slide-welcome]').getAttribute('data-slide')).toBe('0');
    expect(await page.locator('[data-slide-games]').getAttribute('data-slide')).toBe('1');
    expect(await page.locator('[data-slide-timings]').getAttribute('data-slide')).toBe('2');
    expect(await page.locator('[data-slide-canteen]').getAttribute('data-slide')).toBe('3');
    await expect(page.locator('[data-slide-welcome] h1')).toContainText('GAMING ARENA');
    await expect(page.locator('[data-dot]')).toHaveCount(4);
  });

  test('slide 1 shows the hero picture and it fits the screen', async ({ page }) => {
    for (const w of [360, 1280]) {
      await open(page, w);
      const img = page.locator('[data-hero-image]');
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const box = (await img.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(w + 1);
    }
  });

  test('arrows, dots and the keyboard move between slides, and it wraps around', async ({ page }) => {
    await open(page);
    await expect.poll(() => activeIndex(page)).toBe(0);
    await page.locator('[data-next]').click();
    await expect.poll(() => activeIndex(page)).toBe(1);
    await page.locator('[data-dot-index="3"]').click();
    await expect.poll(() => activeIndex(page)).toBe(3);
    await page.locator('[data-next]').click();
    await expect.poll(() => activeIndex(page)).toBe(0); // last -> first
    await page.locator('[data-prev]').click();
    await expect.poll(() => activeIndex(page)).toBe(3); // first -> last
    await page.locator('[data-slider]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => activeIndex(page)).toBe(2);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => activeIndex(page)).toBe(3);
  });

  test('the games slide lists the games with starting prices, and booking follows the chosen game type', async ({ page }) => {
    await open(page);
    await page.locator('[data-dot-index="1"]').click();
    await expect.poll(() => page.locator('[data-game-card]').count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-filter="PS5"]')).toContainText('from ₹');
    await expect(page.locator('[data-filter="PC"]')).toContainText('from ₹');
    await page.locator('[data-filter="PS5"]').click();
    await page.locator('[data-slide-book]').click();
    await expect(page.locator('[data-type]')).toHaveValue('ps5');
  });

  test('the timings slide has the open status and highlights today', async ({ page }) => {
    await open(page);
    await page.locator('[data-dot-index="2"]').click();
    await expect(page.locator('[data-slide-status]')).toHaveText(/Open now · closes 10:00 pm|Opens (today|tomorrow|[A-Z][a-z]{2}) at \d{1,2}:\d{2} (am|pm)/);
    await expect(page.locator('[data-slide-hours]')).toHaveCount(2);
    await expect(page.locator('[data-slide-timings] svg[role="img"]')).toBeVisible(); // the clock
  });

  test('the canteen slide shows up to four items', async ({ page }) => {
    await open(page);
    await page.locator('[data-dot-index="3"]').click();
    const items = page.locator('[data-slide-canteen-item]');
    expect(await items.count()).toBeGreaterThanOrEqual(1);
    expect(await items.count()).toBeLessThanOrEqual(4);
    await expect(items.first()).toContainText('₹');
  });

  test('only the slide showing is available to screen readers and the Tab key', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-slide="0"]')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-slide="1"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-slide="1"]')).toHaveAttribute('inert', '');
    await page.locator('[data-next]').click();
    await expect(page.locator('[data-slide="0"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-slide="1"]')).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('a swipe to the left shows the next slide, to the right the previous', async ({ page }) => {
    await open(page);
    const box = (await page.locator('[data-slide="0"]').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => activeIndex(page)).toBe(1);
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => activeIndex(page)).toBe(0);
  });

  test('it moves on by itself, and waits while the pointer is on it', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    await page.locator('[data-slider]').hover();
    await page.waitForTimeout(9000); // longer than one slide's time
    await expect.poll(() => activeIndex(page)).toBe(0);
    await page.mouse.move(2, 2); // pointer leaves
    await expect.poll(() => activeIndex(page), { timeout: 15_000 }).toBe(1);
  });

  test('it does not move by itself for people who ask for less motion', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.waitForTimeout(9000);
    await expect.poll(() => activeIndex(page)).toBe(0);
    await page.locator('[data-next]').click(); // but the buttons still work
    await expect.poll(() => activeIndex(page)).toBe(1);
  });

  for (const w of [360, 768, 1280]) {
    test(`every slide fits at ${w} px with no sideways scroll`, async ({ page }) => {
      await open(page, w);
      for (let i = 0; i < 4; i++) {
        await page.locator(`[data-dot-index="${i}"]`).click();
        await page.waitForTimeout(900);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, `slide ${i + 1}`).toBeLessThanOrEqual(0);
        // the slide's own content is inside the screen
        const inside = await page.evaluate((idx) => {
          const el = document.querySelector(`[data-slide="${idx}"]`)!;
          const r = el.getBoundingClientRect();
          return r.left >= -1 && r.right <= window.innerWidth + 1;
        }, i);
        expect(inside, `slide ${i + 1} inside the screen`).toBe(true);
      }
    });
  }
});
