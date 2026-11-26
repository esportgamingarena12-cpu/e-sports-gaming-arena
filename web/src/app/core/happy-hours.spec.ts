import { describe, expect, it } from 'vitest';
import { activeHappy, daysText, discounted, HappyInfo, istMoment, offDateText, parseHappyInfo, timeText, windowText } from './happy-hours';

const at = (iso: string): number => Date.parse(iso); // e.g. '2026-11-23T15:00:00+05:30' (a Monday)

const info = (over: Partial<HappyInfo> = {}): HappyInfo => ({
  on: true,
  rules: [
    { name: 'Weekday afternoon', days: [1, 2, 3, 4, 5], start: '15:00', end: '18:00', percent: 20, station_type: null },
    { name: 'Late PC', days: [0, 1, 2, 3, 4, 5, 6], start: '21:00', end: '22:00', percent: 50, station_type: 'pc' },
  ],
  off_dates: [],
  ...over,
});

describe('activeHappy (same rules as happy_hour_at in the database)', () => {
  it('the start time is inside, the end time is outside', () => {
    expect(activeHappy(info(), 'pc', at('2026-11-23T15:00:00+05:30'))?.percent).toBe(20);
    expect(activeHappy(info(), 'pc', at('2026-11-23T14:59:00+05:30'))).toBeNull();
    expect(activeHappy(info(), 'ps5', at('2026-11-23T17:59:00+05:30'))?.percent).toBe(20);
    expect(activeHappy(info(), 'pc', at('2026-11-23T18:00:00+05:30'))).toBeNull();
  });
  it('only on the ticked days', () => {
    expect(activeHappy(info(), 'pc', at('2026-11-28T16:00:00+05:30'))).toBeNull(); // Saturday
    expect(activeHappy(info(), 'pc', at('2026-11-29T16:00:00+05:30'))).toBeNull(); // Sunday
  });
  it('a rule for one game type does not apply to another', () => {
    expect(activeHappy(info(), 'pc', at('2026-11-23T21:30:00+05:30'))?.percent).toBe(50);
    expect(activeHappy(info(), 'ps5', at('2026-11-23T21:30:00+05:30'))).toBeNull();
  });
  it('uses India time, not the computer\'s', () => {
    expect(activeHappy(info(), 'pc', at('2026-11-23T16:15:00Z'))?.percent).toBe(50); // 9:45 pm IST
    expect(istMoment(at('2026-11-23T20:00:00Z'))).toMatchObject({ day: '2026-11-24', weekday: 2, minutes: 90 }); // 1:30 am IST next day
  });
  it('the biggest percent wins and rules never add up', () => {
    const i = info({ rules: [...info().rules, { name: 'Big', days: [1], start: '16:00', end: '17:00', percent: 30, station_type: 'pc' }] });
    expect(activeHappy(i, 'pc', at('2026-11-23T16:30:00+05:30'))).toMatchObject({ percent: 30, name: 'Big' });
    expect(activeHappy(i, 'ps5', at('2026-11-23T16:30:00+05:30'))?.percent).toBe(20);
  });
  it('an off-date and the master switch turn everything off', () => {
    const off = info({ off_dates: [{ day: '2026-11-23', label: 'Holiday' }] });
    expect(activeHappy(off, 'pc', at('2026-11-23T16:00:00+05:30'))).toBeNull();
    expect(activeHappy(off, 'pc', at('2026-11-24T16:00:00+05:30'))?.percent).toBe(20);
    expect(activeHappy({ ...info(), on: false }, 'pc', at('2026-11-23T16:00:00+05:30'))).toBeNull();
    expect(activeHappy(null, 'pc', Date.now())).toBeNull();
  });
  it('says when it ends', () => {
    expect(activeHappy(info(), 'pc', at('2026-11-23T16:00:00+05:30'))?.end).toBe('18:00');
  });
});

describe('discounted', () => {
  it('takes the percent off, in paise, rounded half up like the database', () => {
    expect(discounted(90, 20)).toBe(72);
    expect(discounted('110.00', 20)).toBe(88);
    expect(discounted(50, 10)).toBe(45);
    expect(discounted(33.33, 10)).toBe(30); // 29.997 -> 30.00
    expect(discounted(0.05, 50)).toBe(0.03); // 0.025 -> 0.03 (half up)
    expect(discounted(100, 90)).toBe(10);
  });
});

describe('texts', () => {
  it('times', () => {
    expect(timeText('15:00')).toBe('3 pm');
    expect(timeText('15:30')).toBe('3:30 pm');
    expect(timeText('00:00')).toBe('12 am');
    expect(timeText('12:00')).toBe('12 pm');
    expect(windowText({ start: '15:00', end: '18:30' })).toBe('3 pm to 6:30 pm');
  });
  it('days', () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe('Mon to Fri');
    expect(daysText([6, 0])).toBe('Sat and Sun');
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(daysText([1, 3, 5])).toBe('Mon, Wed and Fri');
    expect(daysText([2])).toBe('Tue');
    expect(daysText([4, 5, 6])).toBe('Thu to Sat');
    expect(daysText([])).toBe('');
  });
  it('off-dates', () => {
    expect(offDateText('2026-11-27')).toBe('27 Nov');
  });
});

describe('parseHappyInfo', () => {
  it('reads a good answer', () => {
    const p = parseHappyInfo({
      on: true,
      rules: [{ name: 'A', days: [1, 2], start: '15:00', end: '18:00', percent: 20, station_type: null }],
      off_dates: [{ day: '2026-12-25', label: 'Christmas' }],
    });
    expect(p.on).toBe(true);
    expect(p.rules[0]).toMatchObject({ name: 'A', percent: 20, station_type: null });
    expect(p.off_dates[0]).toEqual({ day: '2026-12-25', label: 'Christmas' });
  });
  it('anything wrong or switched off means no happy hours', () => {
    expect(parseHappyInfo(null).on).toBe(false);
    expect(parseHappyInfo({ on: false, rules: [{}] }).rules).toEqual([]);
    expect(parseHappyInfo('x').on).toBe(false);
    const p = parseHappyInfo({ on: true, rules: [{ name: 'bad' }, { days: [9, 1], start: '10:00', end: '11:00', percent: 5 }], off_dates: [{ day: 'x' }] });
    expect(p.rules.length).toBe(1);
    expect(p.rules[0].days).toEqual([1]);
    expect(p.off_dates).toEqual([]);
  });
});
