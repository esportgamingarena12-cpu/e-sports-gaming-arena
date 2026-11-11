import { describe, expect, it } from 'vitest';
import { buildAlerts, initials } from './top-tools';

describe('buildAlerts', () => {
  it('has nothing to say when all is quiet', () => {
    expect(buildAlerts({ startingSoon: 0, noShowsToday: 0, lowStock: [] })).toEqual([]);
  });
  it('lists only what needs attention, with singular and plural', () => {
    const a = buildAlerts({ startingSoon: 1, noShowsToday: 2, lowStock: [] });
    expect(a.map((x) => x.text)).toEqual(['1 booking starting within the hour', '2 no-shows today']);
    expect(a.every((x) => x.path === '/counter/bookings')).toBe(true);
  });
  it('names up to three low-stock items and counts the rest', () => {
    expect(buildAlerts({ startingSoon: 0, noShowsToday: 0, lowStock: ['Maggi'] })[0].text).toBe('Low stock: Maggi');
    expect(buildAlerts({ startingSoon: 0, noShowsToday: 0, lowStock: ['A', 'B', 'C', 'D', 'E'] })[0].text).toBe('Low stock: A, B, C and 2 more');
    expect(buildAlerts({ startingSoon: 0, noShowsToday: 0, lowStock: ['A'] })[0].path).toBe('/counter/stock');
  });
});

describe('initials', () => {
  it('uses first and last name', () => {
    expect(initials('Asha Rao')).toBe('AR');
    expect(initials('E2E Admin')).toBe('EA');
    expect(initials('Madhav')).toBe('M');
  });
  it('falls back to the start of an email, and a question mark', () => {
    expect(initials('owner@arena.in')).toBe('O');
    expect(initials('first.last@arena.in')).toBe('FL');
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});
