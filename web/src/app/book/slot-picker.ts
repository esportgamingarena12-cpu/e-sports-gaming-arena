/** Small pure helpers for the home-page booking picker (day strip, day text, parts of the day). */

export interface DayChip {
  /** "YYYY-MM-DD" */
  value: string;
  /** "Today", "Tomorrow" or the weekday ("Thu") */
  top: string;
  /** day of the month, "26" */
  num: string;
  /** month, "Nov" */
  mon: string;
}

const MS_DAY = 86_400_000;
const noon = (ymd: string): number => Date.parse(`${ymd}T12:00:00Z`);
const weekday = (ms: number): string => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
const month = (ms: number): string => new Date(ms).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

/** The days a customer can pick from, from today up to the last bookable day (at most `limit`). Dates are plain calendar days. */
export function dayChips(today: string, maxDay: string, limit = 14): DayChip[] {
  const out: DayChip[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return out;
  for (let i = 0; i < limit; i++) {
    const ms = noon(today) + i * MS_DAY;
    const value = new Date(ms).toISOString().slice(0, 10);
    if (value > maxDay) break;
    out.push({ value, top: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekday(ms), num: String(new Date(ms).getUTCDate()), mon: month(ms) });
  }
  return out;
}

/** "2026-11-26" -> "Thu 26 Nov". Anything that is not a date is returned as it is. */
export function dayText(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const ms = noon(ymd);
  return `${weekday(ms)} ${new Date(ms).getUTCDate()} ${month(ms)}`;
}
