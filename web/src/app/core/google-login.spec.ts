import { describe, expect, it } from 'vitest';
import { afterLoginPath, GOOGLE_PENDING_KEY, googleRedirectUrl, oauthErrorFrom, rememberPending, takePending } from './google-login';
import { homeFor } from './models';

const memory = () => {
  const m = new Map<string, string>();
  return { map: m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const NOW = 1_800_000_000_000;

describe('Google redirect', () => {
  it('sends the customer back to the login page of the same site', () => {
    expect(googleRedirectUrl('https://e-sports-gaming-arena.pages.dev')).toBe('https://e-sports-gaming-arena.pages.dev/book/login');
    expect(googleRedirectUrl('http://localhost:4300/')).toBe('http://localhost:4300/book/login');
  });
});

describe('remembering where to go', () => {
  it('keeps the page the customer wanted and hands it back once', () => {
    const s = memory();
    rememberPending(s, '/book?type=ps5', NOW);
    expect(takePending(s, NOW + 5_000)).toEqual({ next: '/book?type=ps5' });
    expect(takePending(s, NOW + 6_000)).toBeNull(); // cleared after reading
  });
  it('works without a page to return to', () => {
    const s = memory();
    rememberPending(s, null, NOW);
    expect(takePending(s, NOW + 1_000)).toEqual({ next: null });
  });
  it('forgets a note older than ten minutes, or one from the future', () => {
    const old = memory();
    rememberPending(old, '/book', NOW);
    expect(takePending(old, NOW + 11 * 60_000)).toBeNull();
    const future = memory();
    rememberPending(future, '/book', NOW + 3_600_000);
    expect(takePending(future, NOW)).toBeNull();
  });
  it('ignores a damaged note and never throws', () => {
    const s = memory();
    s.map.set(GOOGLE_PENDING_KEY, 'not json');
    expect(takePending(s, NOW)).toBeNull();
    s.map.set(GOOGLE_PENDING_KEY, JSON.stringify({ next: 5, at: NOW }));
    expect(takePending(s, NOW)).toEqual({ next: null });
    expect(takePending(null, NOW)).toBeNull();
    expect(() => rememberPending(null, '/x', NOW)).not.toThrow();
    const broken = { setItem: () => { throw new Error('blocked'); } };
    expect(() => rememberPending(broken, '/x', NOW)).not.toThrow();
  });
});

describe('errors on the way back', () => {
  it('says nothing for a normal return', () => {
    expect(oauthErrorFrom({ hash: '', search: '' })).toBeNull();
    expect(oauthErrorFrom({ hash: '#access_token=abc&token_type=bearer', search: '' })).toBeNull();
    expect(oauthErrorFrom({})).toBeNull();
  });
  it('a cancelled sign-in is explained kindly', () => {
    expect(oauthErrorFrom({ hash: '#error=access_denied&error_code=otp_expired&error_description=Access+denied', search: '' })).toContain('cancelled');
    expect(oauthErrorFrom({ hash: '', search: '?error=access_denied' })).toContain('cancelled');
  });
  it('any other error suggests trying again or the email and password', () => {
    const m = oauthErrorFrom({ hash: '', search: '?error=server_error&error_description=Unable+to+exchange+external+code' })!;
    expect(m).toContain('did not work');
    expect(m).toContain('email and password');
  });
});

describe('where to go after signing in', () => {
  it('staff and admins go to their own area', () => {
    expect(afterLoginPath({ role: 'admin', hasCustomer: false }, '/book', homeFor)).toEqual({ kind: 'url', url: homeFor('admin') });
    expect(afterLoginPath({ role: 'staff', hasCustomer: true }, null, homeFor)).toEqual({ kind: 'url', url: homeFor('staff') });
  });
  it('a first-time customer is asked for name and phone, then continues to where they were going', () => {
    expect(afterLoginPath({ role: 'customer', hasCustomer: false }, '/book?slot=1', homeFor)).toEqual({ kind: 'profile', next: '/book?slot=1' });
    expect(afterLoginPath({ role: 'customer', hasCustomer: false }, null, homeFor)).toEqual({ kind: 'profile', next: '/book' });
  });
  it('a returning customer goes where they were going, or to their bookings', () => {
    expect(afterLoginPath({ role: 'customer', hasCustomer: true }, '/book?type=pc', homeFor)).toEqual({ kind: 'url', url: '/book?type=pc' });
    expect(afterLoginPath({ role: 'customer', hasCustomer: true }, null, homeFor)).toEqual({ kind: 'url', url: '/book/my-bookings' });
  });
});
