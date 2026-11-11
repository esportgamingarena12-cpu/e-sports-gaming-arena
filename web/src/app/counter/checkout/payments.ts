/** Pure payment rules for the checkout dialog. Money is handled in whole paise (integers). */

export const toPaise = (rupees: number | string | null | undefined): number => Math.round(Number(rupees ?? 0) * 100);

export interface PaymentInput {
  cash: number | null;
  upi: number | null;
  card: number | null;
}

export function paidPaise(p: PaymentInput): number {
  return toPaise(p.cash) + toPaise(p.upi) + toPaise(p.card);
}

export type MatchState = 'match' | 'short' | 'over';

/** Compares what was entered with what is due. Only an exact match can be saved. */
export function paymentStatus(totalPaise: number, entered: number): { state: MatchState; diffPaise: number } {
  const diff = entered - totalPaise;
  return { state: diff === 0 ? 'match' : diff < 0 ? 'short' : 'over', diffPaise: Math.abs(diff) };
}

/** Change to hand back for a cash payment; null when the cash received does not cover the cash due. */
export function cashChange(cashDuePaise: number, receivedPaise: number): number | null {
  if (cashDuePaise <= 0 || receivedPaise <= 0) return null;
  return receivedPaise >= cashDuePaise ? receivedPaise - cashDuePaise : null;
}

/** The discount must be between 0 and the subtotal. Returns a message, or null when fine. */
export function discountError(discountPaise: number, subtotalPaise: number): string | null {
  if (discountPaise < 0) return 'Discount cannot be negative';
  if (discountPaise > subtotalPaise) return 'Discount cannot be more than the subtotal';
  return null;
}

/** "₹1,234.50" style without relying on locale data. */
export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

const encode = (s: string): string => encodeURIComponent(s).replace(/%40/g, '@');

/** upi://pay?pa=<upi_id>&pn=<name>&am=<amount>&cu=INR (the UPI part of the bill only). */
export function buildUpiLink(upiId: string, payeeName: string, amountPaise: number): string {
  return `upi://pay?pa=${encode(upiId.trim())}&pn=${encode(payeeName.trim())}&am=${(amountPaise / 100).toFixed(2)}&cu=INR`;
}
