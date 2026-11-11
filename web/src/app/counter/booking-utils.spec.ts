import {
  BookingLike,
  bookingAt,
  canCancel,
  canCheckIn,
  canMarkNoShow,
  hhmmToMinutes,
  istDateOf,
  istMinutesOf,
  minutesToHhmm,
  relativeStart,
  slotStartMs,
  slotStarts,
  upcomingBooking,
  weekdayOf,
} from './booking-utils';

const NOW = Date.parse('2026-11-11T12:00:00+05:30');
const at = (minutesFromNow: number): string => new Date(NOW + minutesFromNow * 60_000).toISOString();
const booking = (station: number, startIn: number, lenMin = 60, status: BookingLike['status'] = 'confirmed'): BookingLike => ({
  station_id: station,
  start_at: at(startIn),
  end_at: at(startIn + lenMin),
  status,
});

describe('booking time helpers', () => {
  it('converts between hh:mm and minutes', () => {
    expect(hhmmToMinutes('10:30')).toBe(630);
    expect(minutesToHhmm(1290)).toBe('21:30');
  });

  it('works in India time', () => {
    // 18:30 UTC on the 11th is 00:00 on the 12th in India
    const ms = Date.parse('2026-11-11T18:30:00Z');
    expect(istDateOf(ms)).toBe('2026-11-12');
    expect(istMinutesOf(ms)).toBe(0);
    expect(slotStartMs('2026-11-12', 0)).toBe(ms);
    expect(istMinutesOf(Date.parse('2026-11-11T12:00:00+05:30'))).toBe(720);
  });

  it('weekday uses 0 = Sunday like opening_hours', () => {
    expect(weekdayOf('2026-11-08')).toBe(0); // Sunday
    expect(weekdayOf('2026-11-11')).toBe(3); // Wednesday
  });
});

describe('slot generation matches the database rule', () => {
  it('10:00 to 22:00 in 30 minute slots gives 24 starts', () => {
    const s = slotStarts('10:00', '22:00', 30);
    expect(s.length).toBe(24);
    expect(s[0]).toBe(600);
    expect(s[23]).toBe(1290);
  });

  it('a longer booking leaves fewer start times', () => {
    expect(slotStarts('10:00', '22:00', 30, 2).length).toBe(23);
    expect(slotStarts('10:00', '22:00', 30, 8).at(-1)).toBe(1080); // 18:00 + 4 h = 22:00
  });

  it('an opening time off the grid starts at the next slot', () => {
    expect(slotStarts('10:15', '12:00', 30)[0]).toBe(630);
  });
});

describe('which booking occupies a slot', () => {
  it('finds an overlapping active booking and ignores others', () => {
    const list = [booking(1, 0, 60), booking(2, 0, 60, 'cancelled'), booking(3, 0, 60, 'no_show')];
    expect(bookingAt(list, 1, NOW + 30 * 60_000, 30)).toBe(list[0]);
    expect(bookingAt(list, 1, NOW + 60 * 60_000, 30)).toBeNull(); // starts exactly when it ends
    expect(bookingAt(list, 2, NOW, 30)).toBeNull(); // cancelled
    expect(bookingAt(list, 3, NOW, 30)).toBeNull(); // no-show
    expect(bookingAt(list, 9, NOW, 30)).toBeNull(); // other station
  });
});

describe('walk-in conflict warning (FR-37)', () => {
  it('warns about a confirmed booking starting within the hour', () => {
    const b = booking(1, 25);
    expect(upcomingBooking([b], 1, NOW)).toBe(b);
  });

  it('does not warn about one that is more than an hour away', () => {
    expect(upcomingBooking([booking(1, 90)], 1, NOW)).toBeNull();
    expect(upcomingBooking([booking(1, 60)], 1, NOW)).not.toBeNull(); // exactly 60 min counts
  });

  it('warns about a booking whose time has begun but who has not arrived yet', () => {
    expect(upcomingBooking([booking(1, -5, 60)], 1, NOW)).not.toBeNull();
  });

  it('ignores finished, checked-in, cancelled and other-station bookings', () => {
    expect(upcomingBooking([booking(1, -90, 60)], 1, NOW)).toBeNull(); // already over
    expect(upcomingBooking([booking(1, 10, 60, 'checked_in')], 1, NOW)).toBeNull();
    expect(upcomingBooking([booking(1, 10, 60, 'cancelled')], 1, NOW)).toBeNull();
    expect(upcomingBooking([booking(2, 10)], 1, NOW)).toBeNull();
  });

  it('picks the earliest when there are two', () => {
    const early = booking(1, 10);
    const late = booking(1, 40);
    expect(upcomingBooking([late, early], 1, NOW)).toBe(early);
  });
});

describe('what staff can do with a booking', () => {
  it('check-in opens 15 minutes before the start and closes at the end', () => {
    expect(canCheckIn(booking(1, 20), NOW)).toBe(false);
    expect(canCheckIn(booking(1, 15), NOW)).toBe(true);
    expect(canCheckIn(booking(1, -30, 60), NOW)).toBe(true);
    expect(canCheckIn(booking(1, -90, 60), NOW)).toBe(false);
    expect(canCheckIn(booking(1, 5, 60, 'checked_in'), NOW)).toBe(false);
  });

  it('a no-show can be marked once the start has come', () => {
    expect(canMarkNoShow(booking(1, 5), NOW)).toBe(false);
    expect(canMarkNoShow(booking(1, 0), NOW)).toBe(true);
    expect(canMarkNoShow(booking(1, -20), NOW)).toBe(true);
    expect(canMarkNoShow(booking(1, -20, 60, 'cancelled'), NOW)).toBe(false);
  });

  it('only a confirmed booking can be cancelled', () => {
    expect(canCancel(booking(1, 30))).toBe(true);
    expect(canCancel(booking(1, 30, 60, 'checked_in'))).toBe(false);
  });

  it('describes the start relative to now', () => {
    expect(relativeStart(at(25), NOW)).toBe('in 25 min');
    expect(relativeStart(at(0), NOW)).toBe('now');
    expect(relativeStart(at(-5), NOW)).toBe('started 5 min ago');
  });
});
