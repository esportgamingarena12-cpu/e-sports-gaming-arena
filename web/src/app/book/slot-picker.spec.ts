import { describe, expect, it } from 'vitest';
import { dayChips, dayText } from './slot-picker';

describe('dayChips', () => {
  it('starts with Today and Tomorrow, then weekdays, with the day and month', () => {
    const c = dayChips('2026-11-25', '2026-12-31', 4);
    expect(c.map((d) => d.value)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']);
    expect(c.map((d) => d.top)).toEqual(['Today', 'Tomorrow', 'Fri', 'Sat']);
    expect(c[0]).toMatchObject({ num: '25', mon: 'Nov' });
  });
  it('stops at the last bookable day', () => {
    expect(dayChips('2026-11-25', '2026-11-27').map((d) => d.value)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27']);
    expect(dayChips('2026-11-25', '2026-11-25').length).toBe(1);
    expect(dayChips('2026-11-25', '2026-11-24')).toEqual([]);
  });
  it('rolls over the month and year and caps at the limit', () => {
    const c = dayChips('2026-12-30', '2027-03-01', 3);
    expect(c.map((d) => d.value)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(c[2]).toMatchObject({ num: '1', mon: 'Jan' });
    expect(dayChips('2026-11-25', '2027-12-31').length).toBe(14);
  });
  it('gives nothing for a date that is not a date', () => {
    expect(dayChips('soon', '2026-12-31')).toEqual([]);
  });
});

describe('dayText', () => {
  it('writes a day plainly', () => {
    expect(dayText('2026-11-26')).toBe('Thu 26 Nov');
    expect(dayText('2027-01-01')).toBe('Fri 1 Jan');
    expect(dayText('x')).toBe('x');
  });
});
