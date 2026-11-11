/** Pure booking rules for the counter screens. All times are Asia/Kolkata (UTC+05:30, no daylight saving). */

export type BookingStatus = 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

export interface BookingLike {
  station_id: number;
  start_at: string;
  end_at: string;
  status: BookingStatus;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

const MIN = 60_000;
const IST_OFFSET_MS = 330 * MIN;

export const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToHhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Start of an India calendar day (yyyy-mm-dd) as epoch ms. */
export const istDayStartMs = (day: string): number => Date.parse(`${day}T00:00:00+05:30`);

/** The instant at `minutes` after midnight India time on `day`. */
export const slotStartMs = (day: string, minutes: number): number => istDayStartMs(day) + minutes * MIN;

/** India calendar date (yyyy-mm-dd) of an instant. */
export const istDateOf = (ms: number): string => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Minutes since midnight India time of an instant. */
export const istMinutesOf = (ms: number): number => Math.floor(((ms + IST_OFFSET_MS) % (24 * 60 * MIN)) / MIN);

/** Weekday of a yyyy-mm-dd date, 0 = Sunday (same numbering as opening_hours). */
export const weekdayOf = (day: string): number => new Date(`${day}T12:00:00Z`).getUTCDay();

/**
 * Slot start times (minutes since midnight) for one day: multiples of the slot size that start at or
 * after opening and end by closing. Same rule as get_availability in the database.
 */
export function slotStarts(openHhmm: string, closeHhmm: string, slotMin: number, slots = 1): number[] {
  const open = hhmmToMinutes(openHhmm);
  const close = hhmmToMinutes(closeHhmm);
  const first = Math.ceil(open / slotMin) * slotMin;
  const out: number[] = [];
  for (let m = first; m + slots * slotMin <= close; m += slotMin) out.push(m);
  return out;
}

const blocksStation = (s: BookingStatus): boolean => s === 'confirmed' || s === 'checked_in';

/** The active booking (if any) that overlaps the slot [startMs, startMs + slot) on a station. */
export function bookingAt<T extends BookingLike>(
  bookings: T[],
  stationId: number,
  startMs: number,
  slotMin: number,
): T | null {
  const endMs = startMs + slotMin * MIN;
  return (
    bookings.find(
      (b) =>
        b.station_id === stationId &&
        blocksStation(b.status) &&
        Date.parse(b.start_at) < endMs &&
        Date.parse(b.end_at) > startMs,
    ) ?? null
  );
}

/**
 * Walk-in conflict (FR-37): a confirmed booking on this station that starts within `windowMin`
 * minutes, or whose time has already begun and has not ended.
 */
export function upcomingBooking<T extends BookingLike>(
  bookings: T[],
  stationId: number,
  nowMs: number,
  windowMin = 60,
): T | null {
  const hits = bookings
    .filter(
      (b) =>
        b.station_id === stationId &&
        b.status === 'confirmed' &&
        Date.parse(b.start_at) <= nowMs + windowMin * MIN &&
        Date.parse(b.end_at) > nowMs,
    )
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  return hits[0] ?? null;
}

/** Check-in is allowed from 15 minutes before the start until the booking ends. */
export const canCheckIn = (b: BookingLike, nowMs: number, earlyMin = 15): boolean =>
  b.status === 'confirmed' && nowMs >= Date.parse(b.start_at) - earlyMin * MIN && nowMs < Date.parse(b.end_at);

/** A no-show can be recorded once the booking's start time has come. */
export const canMarkNoShow = (b: BookingLike, nowMs: number): boolean =>
  b.status === 'confirmed' && nowMs >= Date.parse(b.start_at);

export const canCancel = (b: BookingLike): boolean => b.status === 'confirmed';

export const minutesUntil = (startIso: string, nowMs: number): number =>
  Math.round((Date.parse(startIso) - nowMs) / MIN);

/** "in 25 min", "now", "started 5 min ago" */
export function relativeStart(startIso: string, nowMs: number): string {
  const m = minutesUntil(startIso, nowMs);
  if (m > 0) return `in ${m} min`;
  if (m === 0) return 'now';
  return `started ${-m} min ago`;
}
