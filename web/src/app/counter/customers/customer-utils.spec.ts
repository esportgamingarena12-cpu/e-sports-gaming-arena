import { describe, expect, it } from 'vitest';
import { bookingStatusLabel, bookParams, isRepeatNoShow, lastBookedText, noShowRate, passParams } from './customer-utils';

describe('no-show warning', () => {
  it('starts at two', () => {
    expect(isRepeatNoShow(0)).toBe(false);
    expect(isRepeatNoShow(1)).toBe(false);
    expect(isRepeatNoShow(2)).toBe(true);
    expect(isRepeatNoShow(5)).toBe(true);
  });
  it('rate', () => {
    expect(noShowRate({ no_shows: 1, bookings: 4 })).toBe('25%');
    expect(noShowRate({ no_shows: 2, bookings: 3 })).toBe('67%');
    expect(noShowRate({ no_shows: 0, bookings: 0 })).toBe('');
  });
});

describe('labels', () => {
  it('booking status', () => {
    expect(bookingStatusLabel('no_show')).toBe('No-show');
    expect(bookingStatusLabel('checked_in')).toBe('Checked in');
  });
  it('last booked', () => {
    expect(lastBookedText(null, (s) => s)).toBe('No bookings yet');
    expect(lastBookedText('2026-11-11', (s) => `on ${s}`)).toBe('Last booking on 2026-11-11');
  });
});

describe('hand-over to other screens', () => {
  it('book: name and phone, phone only when there is one', () => {
    expect(bookParams({ name: 'Asha', phone: '98765 43210' })).toEqual({ name: 'Asha', phone: '98765 43210' });
    expect(bookParams({ name: 'Asha', phone: null })).toEqual({ name: 'Asha' });
  });
  it('pass: the login email is passed only for customers who signed in', () => {
    expect(passParams({ name: 'A', phone: '9', email: 'a@x.in', has_login: true })).toEqual({ name: 'A', phone: '9', email: 'a@x.in' });
    expect(passParams({ name: 'A', phone: '9', email: 'a@x.in', has_login: false })).toEqual({ name: 'A', phone: '9' });
    expect(passParams({ name: 'A', phone: null, email: null, has_login: true })).toEqual({ name: 'A' });
  });
});
