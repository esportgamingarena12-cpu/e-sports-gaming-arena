import { playedMs, SessionSnapshot } from './pricing';

/**
 * "Time is up" rules. The alarm only reminds staff; it never changes billing (that is session_charge / pricing.ts).
 *   - a package session rings when its package minutes are used up
 *   - an hourly (or pass) session rings after `alarm_minutes`, if staff chose a timer when starting it
 *   - "extend" adds `alarm_extra_minutes`, which moves the alarm later and rings again at the new time
 * Played time (paused time removed) is what counts, so a paused session never rings.
 */
export interface AlarmSnapshot extends SessionSnapshot {
  id: number;
  status: 'running' | 'paused' | 'ended';
  alarm_minutes?: number | null;
  alarm_extra_minutes?: number | null;
}

/** Played time at which the alarm rings, in ms, or null when the session has no alarm. */
export function alarmLimitMs(s: AlarmSnapshot): number | null {
  const base = s.package_minutes ?? s.alarm_minutes ?? null;
  if (base === null || base <= 0) return null;
  return (base + Math.max(0, s.alarm_extra_minutes ?? 0)) * 60_000;
}

/** Alarm time left in ms (negative = already past it), or null when there is no alarm. */
export function alarmRemainingMs(s: AlarmSnapshot, nowMs: number): number | null {
  const limit = alarmLimitMs(s);
  if (limit === null) return null;
  return limit - playedMs(s, s.ended_at ? Date.parse(s.ended_at) : nowMs);
}

/** True while a running session has played at least as long as its alarm time. */
export function isTimeUp(s: AlarmSnapshot, nowMs: number): boolean {
  if (s.status !== 'running') return false;
  const left = alarmRemainingMs(s, nowMs);
  return left !== null && left <= 0;
}

/** One acknowledgement per session and alarm time: extending creates a new key, so the alarm rings again. */
export function alarmKey(s: AlarmSnapshot): string {
  return `${s.id}:${alarmLimitMs(s) ?? 0}`;
}

/** The sessions whose time is up and that nobody has dismissed yet, the longest overdue first. */
export function dueAlarms<T extends AlarmSnapshot>(sessions: T[], nowMs: number, dismissed: ReadonlySet<string>): T[] {
  return sessions
    .filter((s) => isTimeUp(s, nowMs) && !dismissed.has(alarmKey(s)))
    .sort((a, b) => (alarmRemainingMs(a, nowMs) ?? 0) - (alarmRemainingMs(b, nowMs) ?? 0));
}

/** "just now", "2 min over", "1 h 05 min over" */
export function overText(leftMs: number): string {
  const over = Math.max(0, Math.floor(-leftMs / 60_000));
  if (over < 1) return 'just now';
  const h = Math.floor(over / 60);
  const m = over % 60;
  return h === 0 ? `${m} min over` : `${h} h ${String(m).padStart(2, '0')} min over`;
}

/** A short beep-beep-beep. Browsers only allow sound after the user has used the page, so a failure is ignored. */
export function playAlarmSound(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.35 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + i * 0.35);
      osc.stop(start + i * 0.35 + 0.3);
    }
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no sound available: the pop-up still shows */
  }
}
