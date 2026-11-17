import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { environment } from '../src/environments/environment.development';

/**
 * Phase 27: no Pause / Resume on a station card, and Extend. Needs the staff and admin test accounts in web/.env.e2e;
 * skips itself when they do not exist in the project. The admin account cleans up (cancels the session it started).
 */
const staffEmail = process.env['E2E_EMAIL'];
const staffPassword = process.env['E2E_PASSWORD'];
const adminEmail = process.env['E2E_ADMIN_EMAIL'];
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
const SB = environment.SUPABASE_URL;
const KEY = environment.SUPABASE_ANON_KEY;

test.describe('extend a session', () => {
  test.skip(!staffEmail || !staffPassword || !adminEmail || !adminPassword, 'Set the staff and admin test accounts in web/.env.e2e');
  test.describe.configure({ mode: 'serial' });

  let accountsOk = false;
  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: staffEmail, password: staffPassword },
    });
    accountsOk = res.ok();
  });
  test.beforeEach(() => test.skip(!accountsOk, 'The staff test account does not exist in this project yet'));

  async function adminToken(request: APIRequestContext): Promise<string> {
    const res = await request.post(`${SB}/auth/v1/token?grant_type=password`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async function login(page: Page): Promise<void> {
    await page.goto('/login');
    await page.getByLabel('Email').fill(staffEmail!);
    await page.getByLabel('Password').fill(staffPassword!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/counter/);
  }

  test('a running card has Extend and Stop, and no Pause or Resume', async ({ page, request }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await page.goto('/counter/stations');
    // the first free station
    const card = page.locator('[data-station]').filter({ has: page.getByRole('button', { name: 'Start' }) }).first();
    const name = (await card.getAttribute('data-station'))!;
    await card.getByRole('button', { name: 'Start' }).click();

    // pick the first package, two times: the note adds the minutes and price up
    const pkgRadio = page.locator('input[type=radio][formcontrolname="plan"]').nth(1);
    if ((await pkgRadio.count()) > 0) {
      await pkgRadio.check();
      await page.locator('[data-count]').selectOption('2');
      await expect(page.locator('[data-count-note]')).toContainText('min in all');
    }
    await page.getByRole('button', { name: 'Start timer' }).click();

    const running = page.locator(`[data-station="${name}"]`);
    await expect(running.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(running.locator('[data-extend]')).toBeVisible();
    await expect(running.getByRole('button', { name: 'Pause' })).toHaveCount(0);
    await expect(running.getByRole('button', { name: 'Resume' })).toHaveCount(0);

    // extend: a package session adds a package, a per-hour one adds minutes
    await running.locator('[data-extend]').click();
    const choice = page.locator('[data-extend-package], [data-extend-minutes]').first();
    await expect(choice).toBeVisible();
    await choice.click();
    await expect(page.locator('[aria-label^="Extend"]')).toHaveCount(0);

    // clean up: the admin cancels the session so the station is free again
    const t = await adminToken(request);
    const sessions = await request.get(`${SB}/rest/v1/sessions?status=in.(running,paused,ended)&select=id,stations(name)`, {
      headers: { apikey: KEY, Authorization: `Bearer ${t}` },
    });
    const mine = ((await sessions.json()) as { id: number; stations: { name: string } }[]).find((s) => s.stations.name === name);
    if (mine) {
      await request.post(`${SB}/rest/v1/rpc/cancel_session`, {
        headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        data: { p_session: mine.id },
      });
    }
  });
});
