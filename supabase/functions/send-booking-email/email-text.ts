// Pure text builders for the booking emails (no Deno or network calls, so they are unit tested).

export type MailKind = 'created' | 'rescheduled' | 'cancelled' | 'reminder';

export interface MailBooking {
  shopName: string;
  customerName: string;
  stationType: string;
  startAt: string;
  endAt: string;
  slots: number;
  slotMinutes: number;
}

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

const DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const TIME = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

export const typeLabel = (t: string): string => {
  const s = (t ?? '').trim();
  return /\d/.test(s) || s.length <= 3 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1);
};

export const lengthText = (slots: number, slotMinutes: number): string => {
  const mins = slots * slotMinutes;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export const whenText = (startIso: string, endIso: string): string => {
  const s = new Date(startIso);
  return `${DAY.format(s)}, ${TIME.format(s)} to ${TIME.format(new Date(endIso))} (India time)`;
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HEADLINE: Record<MailKind, (shop: string) => string> = {
  created: (shop) => `Your booking at ${shop} is confirmed`,
  rescheduled: (shop) => `Your booking at ${shop} was moved`,
  cancelled: (shop) => `Your booking at ${shop} was cancelled`,
  reminder: (shop) => `Reminder: your booking at ${shop} starts in about an hour`,
};

export function buildMail(kind: MailKind, b: MailBooking): Mail {
  const headline = HEADLINE[kind](b.shopName);
  const lines = [
    `Hi ${b.customerName},`,
    '',
    headline + '.',
    '',
    `Game: ${typeLabel(b.stationType)}`,
    `When: ${whenText(b.startAt, b.endAt)}`,
    `Length: ${lengthText(b.slots, b.slotMinutes)}`,
    '',
    kind === 'cancelled'
      ? 'You can book a new slot any time on our booking page.'
      : 'You can change or cancel the booking from My bookings until the cutoff time. After that, please call the counter.',
    '',
    b.shopName,
  ];
  const text = lines.join('\n');
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#0f172a">` +
    `<p>Hi ${esc(b.customerName)},</p><p style="font-size:16px"><strong>${esc(headline)}.</strong></p>` +
    `<table style="font-size:14px">${row('Game', typeLabel(b.stationType))}${row('When', whenText(b.startAt, b.endAt))}` +
    `${row('Length', lengthText(b.slots, b.slotMinutes))}</table>` +
    `<p style="font-size:14px">${esc(lines[lines.length - 3])}</p><p style="color:#64748b">${esc(b.shopName)}</p></div>`;
  return { subject: headline, html, text };
}
