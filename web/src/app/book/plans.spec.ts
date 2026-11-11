import { describe, expect, it } from 'vitest';
import { BookingInfo, PublicPass } from './booking.service';
import { buildPlans, hoursText, loginChips, passPlan, perText } from './plans';

const pass = (over: Partial<PublicPass> = {}): PublicPass => ({
  name: 'Weekly PC',
  price: 1499,
  validity_days: 7,
  station_type: 'pc',
  kind: 'unlimited',
  minutes_total: null,
  popular: false,
  ...over,
});

const info = (over: Partial<BookingInfo> = {}): BookingInfo => ({
  shop_name: 'Arena',
  slot_minutes: 30,
  min_slots: 1,
  max_slots: 8,
  window_days: 7,
  cutoff_hours: 2,
  types: ['pc', 'ps5'],
  rates: [
    { type: 'pc', rate_per_hour: 60 },
    { type: 'ps5', rate_per_hour: 120 },
  ],
  passes: [],
  ...over,
});

describe('plan text', () => {
  it('hours and days', () => {
    expect(hoursText(120)).toBe('2 h');
    expect(hoursText(90)).toBe('1 h 30 min');
    expect(hoursText(45)).toBe('45 min');
    expect(perText(1)).toBe('day');
    expect(perText(30)).toBe('30 days');
  });
});

describe('passPlan', () => {
  it('an unlimited pass', () => {
    const p = passPlan(pass());
    expect(p.price).toBe(1499);
    expect(p.per).toBe('7 days');
    expect(p.lines[0]).toBe('Unlimited play');
    expect(p.lines).toContain('PC stations');
    expect(p.type).toBe('pc');
  });
  it('an hours bundle for all games', () => {
    const p = passPlan(pass({ name: '10 Hours', kind: 'hours', minutes_total: 600, station_type: null, validity_days: 1 }));
    expect(p.lines[0]).toBe('10 h of play');
    expect(p.lines).toContain('All PCs and consoles');
    expect(p.per).toBe('day');
    expect(p.type).toBeNull();
  });
  it('keeps the popular flag', () => expect(passPlan(pass({ popular: true })).popular).toBe(true));
  it('prices come through as numbers even when sent as text', () => {
    expect(passPlan(pass({ price: '399.00' as unknown as number })).price).toBe(399);
  });
});

describe('buildPlans', () => {
  it('has no cards without data', () => {
    expect(buildPlans(null)).toEqual([]);
    expect(buildPlans(info({ rates: [], passes: [] }))).toEqual([]);
  });
  it('lists the hourly rate of each game first, then the passes', () => {
    const plans = buildPlans(info({ passes: [pass(), pass({ name: 'Day', price: 399, validity_days: 1 })] }));
    expect(plans.map((p) => p.title)).toEqual(['PC by the hour', 'PS5 by the hour', 'Weekly PC', 'Day']);
    expect(plans[0].price).toBe(60);
    expect(plans[1].price).toBe(120);
    expect(plans[0].per).toBe('hour');
  });
  it('keys are unique', () => {
    const plans = buildPlans(info({ passes: [pass(), pass({ name: 'Day' })] }));
    expect(new Set(plans.map((p) => p.key)).size).toBe(plans.length);
  });
});

describe('login banner chips', () => {
  it('shows each game type with its lowest rate, then the plain facts (at most 4)', () => {
    expect(loginChips(info())).toEqual(['PC from ₹60/h', 'PS5 from ₹120/h', 'Easy booking', 'Pay at the counter']);
  });
  it('uses the lowest of several rates and copes with a type that has none', () => {
    const i = info({ types: ['pc', 'vr'], rates: [{ type: 'pc', rate_per_hour: 80 }, { type: 'pc', rate_per_hour: 50 }] });
    expect(loginChips(i).slice(0, 2)).toEqual(['PC from ₹50/h', 'VR']);
  });
  it('falls back to the plain facts before the shop info has loaded', () => {
    expect(loginChips(null)).toEqual(['Easy booking', 'Pay at the counter']);
  });
});
