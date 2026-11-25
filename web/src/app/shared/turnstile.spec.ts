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
