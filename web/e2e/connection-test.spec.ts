import { expect, test } from '@playwright/test';

/** The connection test page: it runs the same kinds of requests as signing in and shows which ones fail. The server's answers are supplied by the test. */
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

async function serverAnswers(page: import('@playwright/test').Page, mode: 'fine' | 'drops-big'): Promise<void> {
  await page.route('**/functions/v1/secure-login', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const size = (route.request().postData() ?? '').length;
    if (mode === 'drops-big' && size > 1000) return route.abort('connectionreset');
    return route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{"error":"Invalid request"}' });
  });
  await page.route('**/rest/v1/rpc/happy_hours_info', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"on":false,"rules":[],"off_dates":[]}' }));
  await page.route('**/challenges.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* test */' }));
}

test.describe('connection test page', () => {
  test('is linked from both login pages', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('[data-link-connection-test]')).toBeVisible();
    await page.goto('/book/login');
    await expect(page.locator('[data-link-connection-test]')).toBeVisible();
  });

  test('all checks pass when the server answers', async ({ page }) => {
    await serverAnswers(page, 'fine');
    await page.goto('/connection-test');
    await page.locator('[data-run-test]').click();
    await expect(page.locator('[data-verdict]')).toContainText('reaches the server normally', { timeout: 60_000 });
    expect(await page.locator('[data-result][data-ok="false"]').count()).toBe(0);
    expect(await page.locator('[data-result]').count()).toBeGreaterThanOrEqual(5);
  });

  test('a connection that drops big requests is shown as the failing check', async ({ page }) => {
    await serverAnswers(page, 'drops-big');
    await page.goto('/connection-test');
    await page.locator('[data-run-test]').click();
    await expect(page.locator('[data-verdict]')).toContainText('checks failed', { timeout: 60_000 });
    await expect(page.locator('[data-result="Login service, 1.5 KB request"]')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('[data-result="Login service, 3 KB request"]')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('[data-result="Login service (5 tries)"]')).toHaveAttribute('data-ok', 'true'); // small requests were fine
    await expect(page.locator('textarea')).toHaveValue(/FAILED Login service, 1\.5 KB request/);
  });

  test('fits a phone screen with no sideways scroll', async ({ page }) => {
    await serverAnswers(page, 'fine');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/connection-test');
    await page.locator('[data-run-test]').click();
    await expect(page.locator('[data-verdict]')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
