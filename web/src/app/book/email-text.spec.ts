import { describe, expect, it } from 'vitest';
import { buildMail, lengthText, MailBooking, whenText } from '../../../../supabase/functions/send-booking-email/email-text';

// 6:00 pm to 7:00 pm India time on 12 Nov 2026 = 12:30 to 13:30 UTC
const booking: MailBooking = {
  shopName: 'E-Sports Gaming Arena',
  customerName: 'Asha <b>',
  stationType: 'ps5',
  startAt: '2026-11-12T12:30:00Z',
  endAt: '2026-11-12T13:30:00Z',
  slots: 2,
  slotMinutes: 30,
};

describe('booking emails', () => {
  it('shows India time, not UTC', () => {
    const w = whenText(booking.startAt, booking.endAt);
    expect(w).toContain('6:00');
    expect(w).toContain('7:00');
    expect(w).toContain('India time');
    expect(w).toMatch(/12 Nov.*2026/);
  });
  it('formats lengths', () => {
    expect(lengthText(1, 30)).toBe('30 min');
    expect(lengthText(2, 30)).toBe('1 h');
    expect(lengthText(3, 30)).toBe('1 h 30 min');
  });
  it('has a subject for each kind', () => {
    expect(buildMail('created', booking).subject).toMatch(/confirmed/);
    expect(buildMail('rescheduled', booking).subject).toMatch(/moved/);
    expect(buildMail('cancelled', booking).subject).toMatch(/cancelled/);
    expect(buildMail('reminder', booking).subject).toMatch(/Reminder.*hour/);
  });
  it('names the game, time and length in both versions', () => {
    const m = buildMail('created', booking);
    for (const body of [m.text, m.html]) {
      expect(body).toContain('PS5');
      expect(body).toContain('1 h');
      expect(body).toContain('6:00');
    }
  });
  it('escapes the customer name in the html version', () => {
    const m = buildMail('created', booking);
    expect(m.html).not.toContain('<b>');
    expect(m.html).toContain('Asha &lt;b&gt;');
  });
  it('a cancellation invites a new booking instead of mentioning changes', () => {
    expect(buildMail('cancelled', booking).text).toMatch(/book a new slot/);
    expect(buildMail('created', booking).text).toMatch(/change or cancel/);
  });
});
