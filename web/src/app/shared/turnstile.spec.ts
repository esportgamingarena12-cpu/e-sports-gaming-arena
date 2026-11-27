import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_REQUIRED, waitForToken } from './turnstile';

describe('waitForToken (the sign-in buttons are never blocked by the security check)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the token at once when it is already there', async () => {
    if (!CAPTCHA_REQUIRED) return;
    expect(await waitForToken(() => 'tok')).toBe('tok');
  });

  it('waits for a token that arrives a moment later', async () => {
    if (!CAPTCHA_REQUIRED) return;
    let token = '';
    setTimeout(() => (token = 'late'), 700);
    const p = waitForToken(() => token, 4000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe('late');
  });

  it('gives up after the time limit and returns an empty token, so the login still goes ahead', async () => {
    if (!CAPTCHA_REQUIRED) return;
    const p = waitForToken(() => '', 4000);
    await vi.advanceTimersByTimeAsync(4500);
    expect(await p).toBe('');
  });

  it('with the security check switched off it returns an empty token without waiting', async () => {
    if (CAPTCHA_REQUIRED) return;
    expect(await waitForToken(() => '')).toBe('');
  });
});

describe('tokenFor (a sign-in started before the security check is ready)', () => {
  it('returns the token at once, without waiting, when the check has passed', async () => {
    if (!CAPTCHA_REQUIRED) return;
    const { signal } = await import('@angular/core');
    const { tokenFor } = await import('./turnstile');
    const waiting = signal(false);
    expect(await tokenFor(() => 'tok', waiting)).toBe('tok');
    expect(waiting()).toBe(false);
  });
  it('says it is waiting while the check is not ready, then returns the token and stops saying it', async () => {
    if (!CAPTCHA_REQUIRED) return;
    vi.useFakeTimers();
    try {
      const { signal } = await import('@angular/core');
      const { tokenFor } = await import('./turnstile');
      const waiting = signal(false);
      let token = '';
      setTimeout(() => (token = 'late'), 1500);
      const p = tokenFor(() => token, waiting);
      await vi.advanceTimersByTimeAsync(300);
      expect(waiting()).toBe(true);
      await vi.advanceTimersByTimeAsync(1500);
      expect(await p).toBe('late');
      expect(waiting()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
