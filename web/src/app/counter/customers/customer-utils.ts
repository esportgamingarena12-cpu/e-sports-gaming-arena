/** Types and pure helpers for the staff Customers screen. */
import { BookingStatus, STATUS_LABEL } from '../booking-utils';

export interface CustomerRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  has_login: boolean;
  last_booking: string | null;
  bookings: number;
  no_shows: number;
  active_passes: number;
}

export interface CustomerDetail {
  customer: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    has_login: boolean;
    notes: string | null;
    created_at: string;
  };
  counts: { bookings: number; no_shows: number; cancelled: number; attended: number };
  bookings: { id: number; start_at: string; end_at: string; station_type: string; slots: number; status: BookingStatus; channel: string }[];
  passes: {
    id: number;
    name: string;
    kind: 'unlimited' | 'hours';
    station_type: string | null;
    minutes_total: number | null;
    minutes_used: number;
    starts_at: string;
    expires_at: string;
    status: 'active' | 'cancelled';
    price: number;
  }[];
  bills: { bill_no: number; created_at: string; total: number; status: 'paid' | 'void'; kind: 'booking' | 'pass' }[];
  spent: number;
}

/** Two or more no-shows is worth a word at the counter. */
export const NO_SHOW_WARNING_AT = 2;
export const isRepeatNoShow = (noShows: number): boolean => noShows >= NO_SHOW_WARNING_AT;

/** Share of booked slots that were not honoured: "50%" or "" when there is nothing to judge. */
export function noShowRate(c: { no_shows: number; bookings: number }): string {
  return c.bookings > 0 ? `${Math.round((100 * c.no_shows) / c.bookings)}%` : '';
}

export const bookingStatusLabel = (s: BookingStatus): string => STATUS_LABEL[s] ?? s;

/** The query params the Book and Passes screens read to start with this customer filled in. */
export function bookParams(c: { name: string; phone: string | null }): Record<string, string> {
  return { name: c.name, ...(c.phone ? { phone: c.phone } : {}) };
}
export function passParams(c: { name: string; phone: string | null; email: string | null; has_login: boolean }): Record<string, string> {
  return { name: c.name, ...(c.phone ? { phone: c.phone } : {}), ...(c.has_login && c.email ? { email: c.email } : {}) };
}

/** "Last booked 11 Nov" text, or "No bookings yet". */
export function lastBookedText(iso: string | null, format: (iso: string) => string): string {
  return iso ? `Last booking ${format(iso)}` : 'No bookings yet';
}
