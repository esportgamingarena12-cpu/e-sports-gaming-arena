import { SessionSnapshot } from '../../core/pricing';

/** Pure helpers for "customer left earlier" (setting the real end time of a session nobody stopped). All times are India time. */

const IST_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A moment as the text a datetime-local box wants, in India time: "2026-11-17T17:10". */
export function istInputValue(ms: number): string {
  const p = Object.fromEntries(IST_PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p['year']}-${p['month']}-${p['day']}T${p['hour']}:${p['minute']}`;
}

/** What a datetime-local box holds (India time) as milliseconds, or null when it is empty or not a time. */
export function parseIstInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+05:30`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The first reason an end time cannot be used, or null. The same limits the database enforces: after the session
 * started (plus any time that was not counted), and not in the future.
 */
export function endTimeProblem(s: Pick<SessionSnapshot, 'started_at' | 'paused_seconds'>, endMs: number | null, nowMs: number): string | null {
  if (endMs === null) return 'Choose the end time';
  if (endMs > nowMs) return 'The end time cannot be in the future';
  if (endMs <= Date.parse(s.started_at) + s.paused_seconds * 1000) return 'The end time must be after the session started';
  return null;
}

/** The session as it would be if it ended at endMs, for the live price preview (the same fix-ups the database makes). */
export function withEnd(s: SessionSnapshot, endMs: number): SessionSnapshot {
  const pausedExtra = s.paused_at ? Math.max(0, Math.floor((endMs - Date.parse(s.paused_at)) / 1000)) : 0;
  return { ...s, ended_at: new Date(endMs).toISOString(), paused_at: null, paused_seconds: s.paused_seconds + pausedExtra };
}
