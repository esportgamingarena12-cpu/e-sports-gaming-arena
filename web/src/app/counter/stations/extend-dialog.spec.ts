import { extendedTotal, HOURLY_EXTENDS } from './extend-dialog';

describe('extendedTotal', () => {
  it('adds the minutes and the prices', () => {
    expect(extendedTotal(30, 50, { minutes: 60, price: 90 })).toEqual({ minutes: 90, price: 140 });
  });
  it('can be applied again for a second extension', () => {
    const once = extendedTotal(30, 50, { minutes: 30, price: 50 });
    expect(extendedTotal(once.minutes, once.price, { minutes: 60, price: 90 })).toEqual({ minutes: 120, price: 190 });
  });
  it('keeps paise exact', () => {
    expect(extendedTotal(30, 49.9, { minutes: 30, price: 0.2 }).price).toBe(50.1);
  });
  it('offers 30, 60, 90 and 120 minutes for a per-hour session', () => {
    expect(HOURLY_EXTENDS).toEqual([30, 60, 90, 120]);
  });
});
