import { describe, expect, it } from 'vitest';
import { buildRateCard, gameHighlights, hoursSummary, istParts, minutesLabel, openStatus, OpeningDay, packageBase, PublicPackage, rowLabel, savePercent, timeLabel } from './rate-card';

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
      { days: 'Mon – Fri', time: '12:00 pm – 10:00 pm', weekdays: [1, 2, 3, 4, 5] },
      { days: 'Sat – Sun', time: '11:00 am – 10:00 pm', weekdays: [6, 0] },
    ]);
  });

  it('shows a closed day and a single day', () => {
    const odd = SHOP.map((d) => (d.weekday === 3 ? { ...d, closed: true } : d));
    expect(hoursSummary(odd)).toEqual([
      { days: 'Mon – Tue', time: '12:00 pm – 10:00 pm', weekdays: [1, 2] },
      { days: 'Wed', time: 'Closed', weekdays: [3] },
      { days: 'Thu – Fri', time: '12:00 pm – 10:00 pm', weekdays: [4, 5] },
      { days: 'Sat – Sun', time: '11:00 am – 10:00 pm', weekdays: [6, 0] },
    ]);
  });

  it('shows one line when every day is the same, and none without data', () => {
    expect(hoursSummary(SHOP.map((d) => ({ ...d, open: '10:00' })))).toEqual([
      { days: 'Mon – Sun', time: '10:00 am – 10:00 pm', weekdays: [1, 2, 3, 4, 5, 6, 0] },
    ]);
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

describe('open now', () => {
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
  // India time is UTC + 5:30. 2026-11-16 is a Monday.
  const ist = (iso: string): number => Date.parse(`${iso}+05:30`);

  it('reads the weekday and the minutes in India, not the viewer\'s zone', () => {
    expect(istParts(ist('2026-11-16T12:30:00'))).toEqual({ weekday: 1, minutes: 12 * 60 + 30 });
    expect(istParts(ist('2026-11-21T23:59:00'))).toEqual({ weekday: 6, minutes: 23 * 60 + 59 });
    // 20:00 UTC on Monday is already 01:30 on Tuesday in India
    expect(istParts(Date.parse('2026-11-16T20:00:00Z'))).toEqual({ weekday: 2, minutes: 90 });
  });

  it('is open between opening and closing, and says when it closes', () => {
    const s = openStatus(SHOP, ist('2026-11-16T15:00:00'))!;
    expect(s.open).toBe(true);
    expect(s.text).toBe('Open now · closes 10:00 pm');
    expect(s.today).toBe(1);
  });

  it('opens at the opening minute and closes at the closing minute', () => {
    expect(openStatus(SHOP, ist('2026-11-16T12:00:00'))!.open).toBe(true);
    expect(openStatus(SHOP, ist('2026-11-16T11:59:00'))!.open).toBe(false);
    expect(openStatus(SHOP, ist('2026-11-16T21:59:00'))!.open).toBe(true);
    expect(openStatus(SHOP, ist('2026-11-16T22:00:00'))!.open).toBe(false);
  });

  it('before opening it says when it opens today', () => {
    expect(openStatus(SHOP, ist('2026-11-16T09:00:00'))!.text).toBe('Opens today at 12:00 pm');
  });

  it('after closing it says it opens tomorrow, with tomorrow\'s hours', () => {
    expect(openStatus(SHOP, ist('2026-11-16T22:30:00'))!.text).toBe('Opens tomorrow at 12:00 pm');
    // Friday night -> Saturday opens at 11:00 am
    expect(openStatus(SHOP, ist('2026-11-20T23:00:00'))!.text).toBe('Opens tomorrow at 11:00 am');
  });

  it('skips a closed day and names the day it opens', () => {
    const shut = SHOP.map((d) => (d.weekday === 2 ? { ...d, closed: true } : d)); // Tuesday closed
    expect(openStatus(shut, ist('2026-11-16T22:30:00'))!.text).toBe('Opens Wed at 12:00 pm');
    // on the closed Tuesday itself, Wednesday is tomorrow
    expect(openStatus(shut, ist('2026-11-17T15:00:00'))!.text).toBe('Opens tomorrow at 12:00 pm');
  });

  it('weekend hours differ from weekdays', () => {
    expect(openStatus(SHOP, ist('2026-11-21T11:30:00'))!.open).toBe(true); // Saturday 11:30 is open
    expect(openStatus(SHOP, ist('2026-11-16T11:30:00'))!.open).toBe(false); // Monday 11:30 is not
  });

  it('says Closed when every day is closed, and nothing without hours', () => {
    expect(openStatus(SHOP.map((d) => ({ ...d, closed: true })), ist('2026-11-16T15:00:00'))!.text).toBe('Closed');
    expect(openStatus([], 0)).toBeNull();
    expect(openStatus(null, 0)).toBeNull();
  });
});

describe('game highlights', () => {
  const pk = (name: string, minutes: number, price: number, station_type: string): PublicPackage => ({ name, minutes, price, station_type });
  const info = {
    types: ['pc', 'ps5'],
    rates: [
      { type: 'pc', rate_per_hour: 90 },
      { type: 'ps5', rate_per_hour: 110 },
    ],
    packages: [
      pk('PC 1', 30, 50, 'pc'),
      pk('PC 2', 60, 90, 'pc'),
      pk('PS5 1 Player 30 Min', 30, 60, 'ps5'),
      pk('PS5 4 Players 30 Min', 30, 120, 'ps5'),
      pk('PS5 2 Players 30 Min', 30, 70, 'ps5'),
      pk('PS5 4 Players 1 Hour', 60, 250, 'ps5'),
    ],
  };

  it('starts each game at its cheapest shortest package', () => {
    const [pc, ps5] = gameHighlights(info);
    expect(pc).toMatchObject({ label: 'PC', icon: 'monitor', price: 50, per: '30 min', note: 'Per PC seat' });
    expect(ps5).toMatchObject({ label: 'PS5', icon: 'gamepad', price: 60, per: '30 min', note: 'Up to 4 players' });
  });
  it('falls back to the hourly rate when a game has no packages', () => {
    const [pc] = gameHighlights({ ...info, packages: [] });
    expect(pc).toMatchObject({ price: 90, per: 'hour' });
  });
  it('says hour or hours for whole-hour packages', () => {
    const one = gameHighlights({ types: ['pc'], rates: [], packages: [pk('PC Hour', 60, 90, 'pc')] })[0];
    expect(one).toMatchObject({ price: 90, per: 'hour' });
    const two = gameHighlights({ types: ['pc'], rates: [], packages: [pk('PC Two', 120, 160, 'pc')] })[0];
    expect(two.per).toBe('2 hours');
  });
  it('has no price when there is nothing to price, and no card without data', () => {
    expect(gameHighlights({ types: ['vr'], rates: [], packages: [] })[0]).toMatchObject({ price: null, note: '' });
    expect(gameHighlights(null)).toEqual([]);
    expect(gameHighlights({ types: [], rates: [], packages: [] })).toEqual([]);
  });
  it('a single player reads singular', () => {
    const [g] = gameHighlights({ types: ['ps5'], rates: [], packages: [pk('PS5 1 Player 30 Min', 30, 60, 'ps5')] });
    expect(g.note).toBe('Up to 1 player');
  });
});
