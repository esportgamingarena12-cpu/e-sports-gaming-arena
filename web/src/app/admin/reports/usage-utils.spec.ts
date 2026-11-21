import {
  bestSellers,
  buildUsageCsv,
  CanteenItem,
  hoursText,
  mostUsedType,
  percentOf,
  slowestSellers,
  typeName,
  UsageReport,
  UsageType,
  usageCsvFileName,
} from './report-utils';

const type = (t: string, minutes: number, revenue = 0): UsageType => ({ type: t, stations: 4, sessions: 3, minutes, revenue });
const item = (name: string, qty: number, amount = qty * 10): CanteenItem => ({ name, category: 'Food', qty, amount });

describe('usage report helpers', () => {
  it('names the kinds of station', () => {
    expect(typeName('pc')).toBe('PC');
    expect(typeName('ps5')).toBe('PS5');
  });

  it('writes time played in hours and minutes', () => {
    expect(hoursText(0)).toBe('0 min');
    expect(hoursText(45)).toBe('45 min');
    expect(hoursText(125)).toBe('2 h 5 min');
    expect(hoursText(60)).toBe('1 h 0 min');
    expect(hoursText(-5)).toBe('0 min');
  });

  it('works out shares with one decimal', () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(5, 0)).toBe(0);
  });

  describe('which kind is used more', () => {
    it('picks the one with more hours and gives its share', () => {
      expect(mostUsedType([type('pc', 600), type('ps5', 200)])).toEqual({ type: 'pc', share: 75, tie: false });
      expect(mostUsedType([type('pc', 100), type('ps5', 300)])).toEqual({ type: 'ps5', share: 75, tie: false });
    });
    it('says tie when they are equal', () => {
      expect(mostUsedType([type('pc', 120), type('ps5', 120)])).toMatchObject({ tie: true, share: 50 });
    });
    it('is null when nothing was played', () => {
      expect(mostUsedType([type('pc', 0), type('ps5', 0)])).toBeNull();
      expect(mostUsedType([])).toBeNull();
    });
  });

  describe('canteen ranking', () => {
    const items = [item('Samosa', 12), item('Red bull', 3, 375), item('Pizza', 7, 840), item('Cake', 0, 0), item('Tea', 0, 0), item('Corn', 7, 420)];
    it('best sellers: most first, only items that sold, ties by amount', () => {
      expect(bestSellers(items).map((i) => i.name)).toEqual(['Samosa', 'Pizza', 'Corn', 'Red bull']);
    });
    it('keeps to the limit', () => {
      expect(bestSellers(items, 2).map((i) => i.name)).toEqual(['Samosa', 'Pizza']);
    });
    it('slowest sellers: fewest first, items that sold nothing come first (by name)', () => {
      expect(slowestSellers(items).map((i) => i.name)).toEqual(['Cake', 'Tea', 'Red bull', 'Corn', 'Pizza', 'Samosa']);
      expect(slowestSellers(items, 3).map((i) => i.name)).toEqual(['Cake', 'Tea', 'Red bull']);
    });
    it('does not change the list it was given', () => {
      const copy = items.map((i) => i.name);
      bestSellers(items);
      slowestSellers(items);
      expect(items.map((i) => i.name)).toEqual(copy);
    });
  });

  describe('CSV', () => {
    const u: UsageReport = {
      from: '2026-11-01',
      to: '2026-11-19',
      by_type: [type('pc', 600, 1800.5), type('ps5', 200, 733)],
      by_station: [{ id: 1, name: 'PC 1', type: 'pc', active: true, sessions: 5, minutes: 90, revenue: 150 }],
      canteen: [item('Samosa', 12, 180), { name: 'Cake, large', category: null, qty: 0, amount: 0 }],
    };
    it('has the three tables', () => {
      const csv = buildUsageCsv(u);
      expect(csv).toContain('Kind of station');
      expect(csv).toContain('PC,4,3,10.00,1800.50');
      expect(csv).toContain('PS5,4,3,3.33,733.00');
      expect(csv).toContain('PC 1,PC,5,1.50,150.00');
      expect(csv).toContain('Samosa,Food,12,180.00');
    });
    it('quotes a name that has a comma', () => {
      expect(buildUsageCsv(u)).toContain('"Cake, large"');
    });
    it('names the file by the dates', () => {
      expect(usageCsvFileName(u)).toBe('usage-2026-11-01_to_2026-11-19.csv');
    });
  });
});
