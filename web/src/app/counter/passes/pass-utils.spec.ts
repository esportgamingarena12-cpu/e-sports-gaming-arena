import { describe, expect, it } from 'vitest';
import { checkPayments, daysLeft, minutesLeft, minutesText, passState, paymentLines, PassLike } from './pass-utils';

const NOW = Date.parse('2026-11-11T10:00:00Z');
const pass = (over: Partial<PassLike> = {}): PassLike => ({
  kind: 'unlimited',
  minutes_total: null,
  minutes_used: 0,
  starts_at: '2026-11-10T10:00:00Z',
  expires_at: '2026-11-18T10:00:00Z',
  status: 'active',
  ...over,
});

describe('passState', () => {
  it('active inside its dates', () => expect(passState(pass(), NOW)).toBe('active'));
  it('expired at the expiry instant', () => {
    expect(passState(pass({ expires_at: '2026-11-11T10:00:00Z' }), NOW)).toBe('expired');
    expect(passState(pass({ expires_at: '2026-11-11T10:00:01Z' }), NOW)).toBe('active');
  });
  it('cancelled wins over everything', () => expect(passState(pass({ status: 'cancelled', expires_at: '2020-01-01T00:00:00Z' }), NOW)).toBe('cancelled'));
  it('an hours bundle with nothing left is used up', () => {
    expect(passState(pass({ kind: 'hours', minutes_total: 120, minutes_used: 120 }), NOW)).toBe('used up');
    expect(passState(pass({ kind: 'hours', minutes_total: 120, minutes_used: 119 }), NOW)).toBe('active');
  });
});

describe('minutes', () => {
  it('minutesLeft', () => {
    expect(minutesLeft(pass())).toBeNull();
    expect(minutesLeft(pass({ kind: 'hours', minutes_total: 120, minutes_used: 105 }))).toBe(15);
    expect(minutesLeft(pass({ kind: 'hours', minutes_total: 60, minutes_used: 90 }))).toBe(0);
  });
  it('minutesText', () => {
    expect(minutesText(0)).toBe('0 min');
    expect(minutesText(45)).toBe('45 min');
    expect(minutesText(120)).toBe('2 h');
    expect(minutesText(95)).toBe('1 h 35 min');
  });
  it('daysLeft rounds up and stops at 0', () => {
    expect(daysLeft('2026-11-18T10:00:00Z', NOW)).toBe(7);
    expect(daysLeft('2026-11-11T11:00:00Z', NOW)).toBe(1);
    expect(daysLeft('2026-11-10T10:00:00Z', NOW)).toBe(0);
  });
});

describe('payments', () => {
  it('match, short and over', () => {
    expect(checkPayments(399, 399, 0, 0)).toEqual({ state: 'match', diff: 0 });
    expect(checkPayments(399, 200, 100, 0)).toEqual({ state: 'short', diff: 99 });
    expect(checkPayments(399, 300, 100, 5)).toEqual({ state: 'over', diff: 6 });
  });
  it('uses whole paise (no floating point drift)', () => {
    expect(checkPayments('0.30', '0.10', '0.20', '0').state).toBe('match');
    expect(checkPayments(19.99, 10.01, 9.98, 0).state).toBe('match');
  });
  it('blank fields count as zero', () => expect(checkPayments(50, '', '50', '').state).toBe('match'));
  it('lines leave out zero amounts', () => {
    expect(paymentLines(100, 0, 0)).toEqual([{ mode: 'cash', amount: 100 }]);
    expect(paymentLines('40', '60', '')).toEqual([
      { mode: 'cash', amount: 40 },
      { mode: 'upi', amount: 60 },
    ]);
  });
});
