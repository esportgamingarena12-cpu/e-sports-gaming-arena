import { describe, expect, it } from 'vitest';
import {
  barHeight,
  donutParts,
  durationText,
  playedMinutes,
  stationState,
  buildCsv,
  csvCell,
  hourLabel,
  lastDaysRange,
  linePoints,
  niceMax,
  rangeError,
  SalesReport,
  thisMonthRange,
} from './report-utils';

const report: SalesReport = {
  from: '2026-11-10',
  to: '2026-11-11',
  bills: 3,
  net_sales: 280,
  gaming: 180,
  canteen: 110,
  passes: 0,
  discounts: 10,
  void_count: 1,
  void_value: 500,
  payments: { cash: 180, upi: 40, card: 60 },
  top_items: [
    { name: 'Chips, large', qty: 3, amount: 60 },
    { name: 'Cola "cold"', qty: 2, amount: 50 },
  ],
  daily: [
    { day: '2026-11-10', bills: 1, sales: 80, gaming: 80, canteen: 0, passes: 0, discounts: 0, voids: 0 },
    { day: '2026-11-11', bills: 2, sales: 200, gaming: 100, canteen: 110, passes: 0, discounts: 10, voids: 1 },
  ],
};

describe('dates', () => {
  it('this month starts on the 1st', () => {
    expect(thisMonthRange('2026-11-11')).toEqual({ from: '2026-11-01', to: '2026-11-11' });
  });
  it('last n days include today', () => {
    expect(lastDaysRange('2026-11-11', 7)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
    expect(lastDaysRange('2026-03-02', 3)).toEqual({ from: '2026-02-28', to: '2026-03-02' });
  });
  it('checks the range like the database', () => {
    expect(rangeError('2026-11-01', '2026-11-11')).toBeNull();
    expect(rangeError('2026-11-11', '2026-11-11')).toBeNull();
    expect(rangeError('2026-11-12', '2026-11-11')).toMatch(/must not be after/);
    expect(rangeError('', '2026-11-11')).toMatch(/both dates/);
    expect(rangeError('2025-01-01', '2026-11-11')).toMatch(/one year/);
  });
});

describe('csv', () => {
  it('quotes cells that need it', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(12.5)).toBe('12.5');
  });
  it('has the daily table, a total, the payment modes and the top items', () => {
    const lines = buildCsv(report).split('\r\n');
    expect(lines[0]).toBe('Date,Bills,Gaming (₹),Canteen (₹),Passes (₹),Discounts (₹),Net sales (₹),Void bills');
    expect(lines[1]).toBe('2026-11-10,1,80.00,0.00,0.00,0.00,80.00,0');
    expect(lines[2]).toBe('2026-11-11,2,100.00,110.00,0.00,10.00,200.00,1');
    expect(lines[3]).toBe('TOTAL,3,180.00,110.00,0.00,10.00,280.00,1');
    expect(lines[4]).toBe('');
    expect(lines).toContain('Cash,180.00');
    expect(lines).toContain('UPI,40.00');
    expect(lines).toContain('Card,60.00');
    expect(lines).toContain('"Chips, large",3,60.00');
    expect(lines).toContain('"Cola ""cold""",2,50.00');
  });
  it('every line of the daily table has the same number of columns', () => {
    const lines = buildCsv(report).split('\r\n').slice(0, 4);
    expect(new Set(lines.map((l) => l.split(',').length)).size).toBe(1);
  });
});

describe('charts', () => {
  it('niceMax rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.3)).toBe(0.5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(430)).toBe(500);
    expect(niceMax(900)).toBe(1000);
    expect(niceMax(1000)).toBe(1000);
  });
  it('linePoints spans the width and flips the vertical axis', () => {
    expect(linePoints([0, 50, 100], 200, 100, 100)).toBe('0.0,100.0 100.0,50.0 200.0,0.0');
    expect(linePoints([5], 200, 100, 10)).toBe('0.0,50.0');
    expect(linePoints([], 200, 100, 10)).toBe('');
    expect(linePoints([500], 10, 10, 100)).toBe('0.0,0.0'); // clamped to the top
  });
  it('barHeight keeps small values visible', () => {
    expect(barHeight(0, 100, 80)).toBe(0);
    expect(barHeight(1, 1000, 80)).toBe(2);
    expect(barHeight(50, 100, 80)).toBe(40);
    expect(barHeight(5, 0, 80)).toBe(0);
  });
  it('hour labels', () => {
    expect(hourLabel(0)).toBe('12 am');
    expect(hourLabel(9)).toBe('9 am');
    expect(hourLabel(12)).toBe('12 pm');
    expect(hourLabel(18)).toBe('6 pm');
  });
});

describe('dashboard helpers', () => {
  it('station state', () => {
    const st = { id: 1, name: 'PC 1', type: 'pc', active: true };
    expect(stationState(st, new Set())).toBe('free');
    expect(stationState(st, new Set([1]))).toBe('busy');
    expect(stationState({ ...st, active: false }, new Set([1]))).toBe('off');
  });
  it('played minutes remove pauses and never go negative', () => {
    const base = { id: 1, station_id: 1, customer_name: null, status: 'running' as const };
    const start = Date.parse('2026-11-11T10:00:00Z');
    expect(playedMinutes({ ...base, started_at: '2026-11-11T10:00:00Z', paused_seconds: 600 }, start + 70 * 60000)).toBe(60);
    expect(playedMinutes({ ...base, started_at: '2026-11-11T10:00:00Z', paused_seconds: 9999 }, start + 60000)).toBe(0);
  });
  it('duration text', () => {
    expect(durationText(54)).toBe('54 min');
    expect(durationText(130)).toBe('2 h 10 min');
  });
  it('donut parts add up to 100', () => {
    const p = donutParts(10, 18, 4);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    expect(donutParts(0, 0, 0)).toEqual([0, 0, 0]);
  });
});
