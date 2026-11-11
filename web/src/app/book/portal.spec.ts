import { describe, expect, it } from 'vitest';
import { canChangeBooking, lengthLabel, PortalBooking, portalError, safeNext, splitBookings, typeLabel } from './portal';

const H = 3_600_000;
const NOW = Date.parse('2026-06-01T10:00:00Z');
const bk = (id: number, startH: number, status: PortalBooking['status'] = 'confirmed', lenH = 1): PortalBooking => ({
  id,
  station_type: 'ps5',
  slots: lenH * 2,
  status,
  start_at: new Date(NOW + startH * H).toISOString(),
  end_at: new Date(NOW + (startH + lenH) * H).toISOString(),
});

describe('typeLabel', () => {
  it('formats', () => {
    expect(typeLabel('ps5')).toBe('PS5');
    expect(typeLabel('pc')).toBe('PC');
    expect(typeLabel('pool')).toBe('Pool');
    expect(typeLabel('')).toBe('');
  });
});

describe('safeNext', () => {
  it('allows in-app paths only', () => {
    expect(safeNext('/book/profile')).toBe('/book/profile');
    expect(safeNext('//evil.com')).toBeNull();
    expect(safeNext('https://evil.com')).toBeNull();
    expect(safeNext('/\\evil.com')).toBeNull();
    expect(safeNext('book')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe('portalError', () => {
  it('rewrites a lost race', () => {
    expect(portalError({ message: 'Slot just taken: no station is free for that time' })).toMatch(/just taken/);
  });
  it('passes other messages through', () => {
    expect(portalError({ message: 'Too late to cancel online: please call the counter' })).toMatch(/Too late/);
  });
});

describe('canChangeBooking', () => {
  it('allows 3 h ahead, refuses 1 h ahead (cutoff 2 h)', () => {
    expect(canChangeBooking(bk(1, 3), NOW, 2)).toBe(true);
    expect(canChangeBooking(bk(1, 1), NOW, 2)).toBe(false);
  });
  it('allows exactly at the cutoff, as the database does', () => {
    expect(canChangeBooking(bk(1, 2), NOW, 2)).toBe(true);
  });
  it('refuses non-confirmed bookings', () => {
    expect(canChangeBooking(bk(1, 5, 'cancelled'), NOW, 2)).toBe(false);
    expect(canChangeBooking(bk(1, 5, 'checked_in'), NOW, 2)).toBe(false);
  });
});

describe('splitBookings', () => {
  it('separates and orders', () => {
    const r = splitBookings(
      [bk(1, 30), bk(2, 5), bk(3, -48, 'completed'), bk(4, -24, 'no_show'), bk(5, 8, 'cancelled'), bk(6, -5, 'confirmed')],
      NOW,
    );
    expect(r.upcoming.map((b) => b.id)).toEqual([2, 1]);
    expect(r.past.map((b) => b.id)).toEqual([5, 6, 4, 3]);
  });
  it('keeps an in-progress booking upcoming', () => {
    expect(splitBookings([bk(1, -0.5, 'checked_in')], NOW).upcoming).toHaveLength(1);
  });
});

describe('lengthLabel', () => {
  it('formats', () => {
    expect(lengthLabel(1, 30)).toBe('30 min');
    expect(lengthLabel(2, 30)).toBe('1 h');
    expect(lengthLabel(3, 30)).toBe('1 h 30 min');
  });
});
