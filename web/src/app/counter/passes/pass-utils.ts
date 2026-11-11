/** Pure helpers for the Passes screen (selling and listing prepaid passes). */

export type PassState = 'active' | 'expired' | 'used up' | 'cancelled';

export interface PassLike {
  kind: 'unlimited' | 'hours';
  minutes_total: number | null;
  minutes_used: number;
  starts_at: string;
  expires_at: string;
  status: 'active' | 'cancelled';
}

export function passState(p: PassLike, nowMs: number): PassState {
  if (p.status === 'cancelled') return 'cancelled';
  if (nowMs >= Date.parse(p.expires_at)) return 'expired';
  if (p.kind === 'hours' && (p.minutes_total ?? 0) <= p.minutes_used) return 'used up';
  return 'active';
}

/** Minutes left on an hours bundle; null for an unlimited pass. */
export function minutesLeft(p: Pick<PassLike, 'kind' | 'minutes_total' | 'minutes_used'>): number | null {
  return p.kind === 'hours' ? Math.max(0, (p.minutes_total ?? 0) - p.minutes_used) : null;
}

/** "1 h 30 min", "45 min", "0 min" */
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Whole days (rounded up) until the pass expires; 0 once it has expired. */
export function daysLeft(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 86_400_000));
}

const paise = (v: number | string | null | undefined): number => Math.round(Number(v || 0) * 100);

export interface PaymentCheck {
  state: 'match' | 'short' | 'over';
  diff: number; // rupees, always >= 0
}

/** Does cash + UPI + card add up to the price? Works in whole paise, like the database. */
export function checkPayments(price: number | string, cash: number | string, upi: number | string, card: number | string): PaymentCheck {
  const paid = paise(cash) + paise(upi) + paise(card);
  const due = paise(price);
  return { state: paid === due ? 'match' : paid < due ? 'short' : 'over', diff: Math.abs(due - paid) / 100 };
}

/** The payments array the sell_pass function expects (zero amounts left out). */
export function paymentLines(cash: number | string, upi: number | string, card: number | string): { mode: string; amount: number }[] {
  return [
    { mode: 'cash', amount: paise(cash) / 100 },
    { mode: 'upi', amount: paise(upi) / 100 },
    { mode: 'card', amount: paise(card) / 100 },
  ].filter((l) => l.amount > 0);
}
