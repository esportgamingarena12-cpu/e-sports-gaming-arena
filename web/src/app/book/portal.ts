import { friendlyError } from '../shared/errors';
import { BookingStatus } from '../counter/booking-utils';

/** "ps5" -> "PS5", "pool" -> "Pool". Station types are stored in lower case. */
export function typeLabel(t: string): string {
  const s = (t ?? '').trim();
  if (!s) return '';
  return /\d/.test(s) || s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1);
}

/** Only allow in-app paths as a post-login target (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes(':')) return null;
  return next;
}

/** Plain-language message for a booking error. */
export function portalError(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? '';
  if (/Slot just taken/i.test(m)) return 'Sorry, that time was just taken. Please pick another.';
  if (/complete your profile/i.test(m)) return 'Please add your name and phone first.';
  return friendlyError(e);
}

export interface PortalBooking {
  id: number;
  station_type: string;
  start_at: string;
  end_at: string;
  slots: number;
  status: BookingStatus;
}

/** Customers may cancel or change a confirmed booking until `cutoffHours` before it starts. */
export function canChangeBooking(b: PortalBooking, nowMs: number, cutoffHours: number): boolean {
  return b.status === 'confirmed' && nowMs <= Date.parse(b.start_at) - cutoffHours * 3_600_000;
}

/** Upcoming = confirmed or checked in and not yet ended (soonest first); the rest are past (latest first). */
export function splitBookings<T extends PortalBooking>(list: T[], nowMs: number): { upcoming: T[]; past: T[] } {
  const upcoming = list
    .filter((b) => (b.status === 'confirmed' || b.status === 'checked_in') && Date.parse(b.end_at) > nowMs)
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const ids = new Set(upcoming.map((b) => b.id));
  const past = list.filter((b) => !ids.has(b.id)).sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at));
  return { upcoming, past };
}

/** "1 h", "1 h 30 min", "30 min". */
export function lengthLabel(slots: number, slotMinutes: number): string {
  const mins = slots * slotMinutes;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
