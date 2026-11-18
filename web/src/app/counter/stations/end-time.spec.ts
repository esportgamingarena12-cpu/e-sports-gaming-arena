import { sessionCharge } from '../../core/pricing';
import { endTimeProblem, istInputValue, parseIstInput, withEnd } from './end-time';

const base = {
  rate_per_hour: 90,
  block_min: 15,
  min_bill_min: 30,
  package_minutes: null,
  package_price: null,
  started_at: '2026-11-17T06:30:00+00:00', // 12:00 pm India time
  paused_at: null,
  paused_seconds: 0,
  ended_at: null,
};

describe('India time in the datetime box', () => {
  it('writes a moment as India time', () => {
    expect(istInputValue(Date.parse('2026-11-17T11:40:00+00:00'))).toBe('2026-11-17T17:10');
  });
  it('reads it back', () => {
    expect(parseIstInput('2026-11-17T17:10')).toBe(Date.parse('2026-11-17T11:40:00+00:00'));
  });
  it('round-trips around midnight', () => {
    const ms = Date.parse('2026-11-17T18:45:00+00:00'); // 12:15 am on the 18th in India
    expect(istInputValue(ms)).toBe('2026-11-18T00:15');
    expect(parseIstInput(istInputValue(ms))).toBe(ms);
  });
  it('rejects text that is not a time', () => {
    expect(parseIstInput('')).toBeNull();
    expect(parseIstInput('17:10')).toBeNull();
  });
});

describe('endTimeProblem (the same limits as the database)', () => {
  const now = Date.parse('2026-11-17T12:30:00+00:00');
  it('needs a time', () => expect(endTimeProblem(base, null, now)).toBe('Choose the end time'));
  it('cannot be in the future', () => expect(endTimeProblem(base, now + 60_000, now)).toMatch(/future/));
  it('cannot be at or before the start', () => {
    expect(endTimeProblem(base, Date.parse(base.started_at), now)).toMatch(/after the session started/);
    expect(endTimeProblem(base, Date.parse(base.started_at) - 1, now)).toMatch(/after the session started/);
  });
  it('counts time that was not played: the end must be after the start plus that', () => {
    const s = { ...base, paused_seconds: 600 };
    expect(endTimeProblem(s, Date.parse(base.started_at) + 600_000, now)).toMatch(/after the session started/);
    expect(endTimeProblem(s, Date.parse(base.started_at) + 601_000, now)).toBeNull();
  });
  it('accepts a time between the start and now, and now itself', () => {
    expect(endTimeProblem(base, Date.parse('2026-11-17T08:00:00+00:00'), now)).toBeNull();
    expect(endTimeProblem(base, now, now)).toBeNull();
  });
});

describe('withEnd (the price preview)', () => {
  it('bills only up to the chosen end', () => {
    const end = Date.parse('2026-11-17T07:20:00+00:00'); // 50 minutes played: 60 minutes billed at 90/hr
    expect(sessionCharge(withEnd(base, end), end)).toBe(90);
  });
  it('is far less than billing up to a much later moment', () => {
    const left = Date.parse('2026-11-17T07:20:00+00:00');
    const later = Date.parse('2026-11-17T11:30:00+00:00');
    expect(sessionCharge(withEnd(base, left), left)).toBeLessThan(sessionCharge(base, later));
  });
  it('a session left paused does not count the time after the pause', () => {
    const s = { ...base, paused_at: '2026-11-17T07:00:00+00:00' };
    const end = Date.parse('2026-11-17T08:30:00+00:00');
    expect(withEnd(s, end)).toMatchObject({ paused_at: null, paused_seconds: 5400 });
    expect(sessionCharge(withEnd(s, end), end)).toBe(45); // 30 min played: the minimum bill of 30 min at 90/hr
  });
  it('keeps the overtime rules (package 30 min, grace 10): 35 minutes is free overtime', () => {
    const pkg = { ...base, package_minutes: 30, package_price: 50, overtime_grace_min: 10 };
    const end = Date.parse(base.started_at) + 35 * 60_000;
    expect(sessionCharge(withEnd(pkg, end), end)).toBe(50);
  });
});
