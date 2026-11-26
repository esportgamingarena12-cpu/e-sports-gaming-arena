import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * Happy hours (migration 0034). The SERVER decides the discount when a session starts (happy_hour_at); the functions here only
 * show the same rules to people: the public home page, the Admin page and the counter's start screen. They mirror the SQL:
 * India time, the start time is inside and the end time is outside, off-dates switch everything off, the biggest percent wins.
 */
export interface HappyRule {
  name: string;
  /** 0 = Sunday ... 6 = Saturday */
  days: number[];
  /** "HH:MM" */
  start: string;
  end: string;
  percent: number;
  /** null = every game type */
  station_type: string | null;
}

export interface HappyOffDate {
  /** "YYYY-MM-DD" */
  day: string;
  label: string | null;
}

export interface HappyInfo {
  on: boolean;
  rules: HappyRule[];
  off_dates: HappyOffDate[];
}

export const NO_HAPPY: HappyInfo = { on: false, rules: [], off_dates: [] };

export interface HappyNow {
  percent: number;
  name: string;
  /** "HH:MM" the happy hour ends today */
  end: string;
}

const IST_MS = 5.5 * 3_600_000;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** the week as people read it: Monday first */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Day, weekday (0 = Sunday) and minutes after midnight in India at a moment. */
export function istMoment(nowMs: number): { day: string; weekday: number; minutes: number } {
  const d = new Date(nowMs + IST_MS);
  return { day: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** The happy hour running at a moment for a game type, or null. Same rules as happy_hour_at() in the database. */
export function activeHappy(info: HappyInfo | null | undefined, type: string | null, nowMs: number): HappyNow | null {
  if (!info || !info.on) return null;
  const m = istMoment(nowMs);
  if (info.off_dates.some((o) => o.day === m.day)) return null;
  let best: HappyRule | null = null;
  for (const r of info.rules) {
    if (r.station_type !== null && r.station_type !== type) continue;
    if (!r.days.includes(m.weekday)) continue;
    if (m.minutes < toMin(r.start) || m.minutes >= toMin(r.end)) continue;
    if (!best || r.percent > best.percent) best = r;
  }
  return best ? { percent: best.percent, name: best.name, end: best.end } : null;
}

/** A price with the discount taken off, in whole paise rounded half up (like round(price * (100 - pct) / 100, 2) in the database). */
export function discounted(price: number | string, percent: number): number {
  const paise = Math.round(Number(price) * 100);
  const out = Math.floor((2 * paise * (100 - percent) + 100) / 200);
  return out / 100;
}

/** "3 pm", "3:30 pm", "12 am". */
export function timeText(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const mm = hhmm.slice(3, 5);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm === '00' ? '' : ':' + mm} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Mon to Fri", "Sat and Sun", "Every day", "Mon, Wed and Fri". */
export function daysText(days: number[]): string {
  const set = new Set(days);
  const ordered = WEEK_ORDER.filter((d) => set.has(d));
  if (ordered.length === 0) return '';
  if (ordered.length === 7) return 'Every day';
  const names = ordered.map((d) => DAY_SHORT[d]);
  // one unbroken run of three or more days reads as "Mon to Fri"
  const idx = ordered.map((d) => WEEK_ORDER.indexOf(d));
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (run && names.length >= 3) return `${names[0]} to ${names[names.length - 1]}`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "3 pm to 6 pm". */
export function windowText(rule: { start: string; end: string }): string {
  return `${timeText(rule.start)} to ${timeText(rule.end)}`;
}

/** "27 Nov" for an off-date. */
export function offDateText(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Reads what the database sent; anything wrong becomes "no happy hours". Never throws. */
export function parseHappyInfo(raw: unknown): HappyInfo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (r['on'] !== true) return NO_HAPPY;
  const rules: HappyRule[] = (Array.isArray(r['rules']) ? (r['rules'] as unknown[]) : [])
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
    .filter((x) => typeof x['start'] === 'string' && typeof x['end'] === 'string' && Number.isFinite(Number(x['percent'])) && Array.isArray(x['days']))
    .map((x) => ({
      name: String(x['name'] ?? ''),
      days: (x['days'] as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      start: String(x['start']),
      end: String(x['end']),
      percent: Number(x['percent']),
      station_type: typeof x['station_type'] === 'string' ? (x['station_type'] as string) : null,
    }));
  const off: HappyOffDate[] = (Array.isArray(r['off_dates']) ? (r['off_dates'] as unknown[]) : [])
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
    .filter((x) => typeof x['day'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x['day'] as string))
    .map((x) => ({ day: x['day'] as string, label: typeof x['label'] === 'string' ? (x['label'] as string) : null }));
  return { on: true, rules, off_dates: off };
}

@Injectable({ providedIn: 'root' })
export class HappyHoursService {
  private readonly sb = inject(SupabaseService).client;
  private started = false;

  /** What the public may see: the running rules and the coming off-dates (nothing while the master switch is off). */
  readonly info = signal<HappyInfo>(NO_HAPPY);

  load(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const { data, error } = await this.sb.rpc('happy_hours_info');
      if (error) return;
      this.info.set(parseHappyInfo(data));
    } catch {
      /* keep the last answer */
    }
  }
}
