import { describe, expect, it } from 'vitest';
import { buildRateCard, hoursSummary, minutesLabel, OpeningDay, packageBase, PublicPackage, rowLabel, savePercent, timeLabel } from './rate-card';

const pk = (name: string, minutes: number, price: number, station_type: string): PublicPackage => ({ name, minutes, price, station_type });

const CARD: PublicPackage[] = [
  pk('PC 30 Minutes', 30, 50, 'pc'),
  pk('PC 1 Hour', 60, 90, 'pc'),
  pk('PS5 1 Player 30 Min', 30, 60, 'ps5'),
  pk('PS5 1 Player 1 Hour', 60, 110, 'ps5'),
  pk('PS5 2 Players 30 Min', 30, 70, 'ps5'),
  pk('PS5 2 Players 1 Hour', 60, 150, 'ps5'),
];

describe('rate card', () => {
  it('strips the length from a package name', () => {
    expect(packageBase('PC 30 Minutes')).toBe('PC');
    expect(packageBase('PC 1 Hour')).toBe('PC');
    expect(packageBase('PS5 2 Players 30 Min')).toBe('PS5 2 Players');
    expect(packageBase('PS5 4 Players 1 Hr')).toBe('PS5 4 Players');
    expect(packageBase('Night Special')).toBe('Night Special');
    expect(packageBase('30 Min')).toBe('30 Min'); // never ends up empty
  });

  it('labels lengths', () => {
    expect(minutesLabel(30)).toBe('30 Minutes');
    expect(minutesLabel(60)).toBe('1 Hour');
    expect(minutesLabel(120)).toBe('2 Hours');
    expect(minutesLabel(90)).toBe('1 h 30 min');
  });

  it('builds one row per game and player count, one column per length', () => {
    const c = buildRateCard(CARD)!;
    expect(c.minutes).toEqual([30, 60]);
    expect(c.rows.map((r) => r.label)).toEqual(['PC', 'PS5 1 Player', 'PS5 2 Players']);
    expect(c.rows[0].prices).toEqual({ 30: 50, 60: 90 });
    expect(c.rows[2].prices).toEqual({ 30: 70, 60: 150 });
    expect(c.rows[1].station_type).toBe('ps5');
  });

  it('leaves a gap when a row has only one length', () => {
    const c = buildRateCard([pk('PC 30 Minutes', 30, 50, 'pc'), pk('PS5 1 Hour', 60, 110, 'ps5')])!;
    expect(c.minutes).toEqual([30, 60]);
    expect(c.rows[0].prices[60]).toBeUndefined();
    expect(c.rows[1].prices[30]).toBeUndefined();
  });

  it('a name without a length joins its game row', () => {
    expect(rowLabel(pk('PC 1', 30, 50, 'pc'))).toBe('PC');
    expect(rowLabel(pk('Night pack', 60, 80, 'ps5'))).toBe('PS5');
    expect(rowLabel(pk('PC 30 Minutes', 30, 50, 'pc'))).toBe('PC');
    expect(rowLabel(pk('PS5 2 Players 1 Hour', 60, 150, 'ps5'))).toBe('PS5 2 Players');
  });

  it('packages named "PC 1" and "PC 2" still make one PC row with both prices', () => {
    const c = buildRateCard([pk('PC 1', 30, 50, 'pc'), pk('PC 2', 60, 90, 'pc'), pk('PS5 1 Player 30 Min', 30, 60, 'ps5')])!;
    expect(c.rows.map((r) => r.label)).toEqual(['PC', 'PS5 1 Player']);
    expect(c.rows[0].prices).toEqual({ 30: 50, 60: 90 });
  });

  it('shows no card without packages', () => {
    expect(buildRateCard([])).toBeNull();
    expect(buildRateCard(null)).toBeNull();
    expect(buildRateCard(undefined)).toBeNull();
  });
});

describe('opening hours', () => {
  const day = (weekday: number, open: string, close: string, closed = false): OpeningDay => ({ weekday, open, close, closed });
  const SHOP: OpeningDay[] = [
    day(0, '11:00', '22:00'),
    day(1, '12:00', '22:00'),
    day(2, '12:00', '22:00'),
    day(3, '12:00', '22:00'),
    day(4, '12:00', '22:00'),
    day(5, '12:00', '22:00'),
    day(6, '11:00', '22:00'),
  ];

  it('formats times', () => {
    expect(timeLabel('12:00')).toBe('12:00 pm');
    expect(timeLabel('22:00')).toBe('10:00 pm');
    expect(timeLabel('11:00')).toBe('11:00 am');
    expect(timeLabel('00:30')).toBe('12:30 am');
    expect(timeLabel('13:05')).toBe('1:05 pm');
  });

  it('groups the week: Monday to Friday, then Saturday and Sunday', () => {
    expect(hoursSummary(SHOP)).toEqual([
      { days: 'Mon – Fri', time: '12:00 pm – 10:00 pm' },
      { days: 'Sat – Sun', time: '11:00 am – 10:00 pm' },
    ]);
  });

  it('shows a closed day and a single day', () => {
    const odd = SHOP.map((d) => (d.weekday === 3 ? { ...d, closed: true } : d));
    expect(hoursSummary(odd)).toEqual([
      { days: 'Mon – Tue', time: '12:00 pm – 10:00 pm' },
      { days: 'Wed', time: 'Closed' },
      { days: 'Thu – Fri', time: '12:00 pm – 10:00 pm' },
      { days: 'Sat – Sun', time: '11:00 am – 10:00 pm' },
    ]);
  });

  it('shows one line when every day is the same, and none without data', () => {
    expect(hoursSummary(SHOP.map((d) => ({ ...d, open: '10:00' })))).toEqual([{ days: 'Mon – Sun', time: '10:00 am – 10:00 pm' }]);
    expect(hoursSummary([])).toEqual([]);
    expect(hoursSummary(null)).toEqual([]);
  });
});

describe('discount badge', () => {
  it('gives the percentage saved', () => {
    expect(savePercent(1600, 2000)).toBe(20);
    expect(savePercent(90, 100)).toBe(10);
    expect(savePercent(2, 3)).toBe(33);
  });
  it('gives nothing without a higher "was" price', () => {
    expect(savePercent(100, null)).toBeNull();
    expect(savePercent(100, undefined)).toBeNull();
    expect(savePercent(100, 100)).toBeNull();
    expect(savePercent(100, 80)).toBeNull();
  });
});
