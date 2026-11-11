import { playedMs, SessionSnapshot, sessionCharge } from '../../core/pricing';

/** Shapes returned by the reporting functions (migration 0009) and the pure helpers around them. */

export interface PayModes {
  cash: number;
  upi: number;
  card: number;
}

export interface DailyRow {
  day: string;
  bills: number;
  sales: number;
  gaming: number;
  canteen: number;
  passes: number;
  discounts: number;
  voids: number;
}

export interface TopItem {
  name: string;
  qty: number;
  amount: number;
}

export interface SalesSummary {
  from: string;
  to: string;
  bills: number;
  net_sales: number;
  gaming: number;
  canteen: number;
  passes: number;
  discounts: number;
  void_count: number;
  void_value: number;
  payments: PayModes;
}

export interface SalesReport extends SalesSummary {
  top_items: TopItem[];
  daily: DailyRow[];
}

export interface DashboardData {
  sales: SalesSummary;
  occupancy: { type: string; total: number; in_use: number }[];
  bookings: { upcoming: number; checked_in: number; no_show: number; cancelled: number };
  low_stock: { name: string; stock_qty: number; low_stock_level: number }[];
  active_passes: number;
}

export interface DashStation {
  id: number;
  name: string;
  type: string;
  active: boolean;
}

export interface LiveSession extends SessionSnapshot {
  id: number;
  station_id: number;
  customer_name: string | null;
  pass_name: string | null;
  status: 'running' | 'paused';
}

export type StationState = 'free' | 'busy' | 'off';

/** Free (green), occupied (red) or switched off (orange) for the dashboard quick view. */
export function stationState(s: DashStation, busyIds: Set<number>): StationState {
  return !s.active ? 'off' : busyIds.has(s.id) ? 'busy' : 'free';
}

/** Minutes played so far: elapsed time minus pauses (never negative). */
export function playedMinutes(s: LiveSession, nowMs: number): number {
  return Math.floor(playedMs(s, nowMs) / 60000);
}

/** What the session costs so far (same formula as the database and the counter screen). */
export function liveAmount(s: LiveSession, nowMs: number): number {
  return sessionCharge(s, nowMs);
}

/** Closed polygon under a chart line (for the soft fill), in a w x h box. */
export function areaPoints(line: string, w: number, h: number): string {
  return line ? `0,${h} ${line} ${w},${h}` : '';
}

/** The last point of a line (for the end dot), or null. */
export function lastPoint(line: string): { x: number; y: number } | null {
  const last = line.trim().split(' ').pop();
  if (!last || !last.includes(',')) return null;
  const [x, y] = last.split(',').map(Number);
  return { x, y };
}

/** "2 h 10 min", "54 min" */
export function durationText(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m} min` : `${h} h ${m} min`;
}

/** Stroke lengths for a three-part donut (circumference 100): [free, busy, off]. Empty data gives all zeros. */
export function donutParts(free: number, busy: number, off: number): number[] {
  const total = free + busy + off;
  return total > 0 ? [free, busy, off].map((n) => (100 * n) / total) : [0, 0, 0];
}

export interface TrendRow {
  day: string;
  sales: number;
  occupancy: number;
}

export interface HourRow {
  hour: number;
  session_count: number;
  sales: number;
}

// ---------- dates ----------

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** First day of the month up to `today` (yyyy-mm-dd). */
export function thisMonthRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** The last `n` days including today. */
export function lastDaysRange(today: string, n: number): { from: string; to: string } {
  return { from: addDays(today, -(n - 1)), to: today };
}

/** Same rules as sales_report in the database: both dates, in order, at most a year. */
export function rangeError(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'Choose both dates';
  if (from > to) return 'The start date must not be after the end date';
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return 'Choose a range of at most one year';
  return null;
}

// ---------- CSV ----------

/** Quotes a cell when it holds a comma, quote or line break. */
export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (n: number): string => n.toFixed(2);
const row = (cells: (string | number)[]): string => cells.map(csvCell).join(',');

/**
 * One row per day plus a total, then the payment modes and the top items.
 * Amounts are plain numbers (so Excel can add them up); the unit is in the column titles.
 */
export function buildCsv(r: SalesReport): string {
  const lines: string[] = [];
  lines.push(row(['Date', 'Bills', 'Gaming (₹)', 'Canteen (₹)', 'Passes (₹)', 'Discounts (₹)', 'Net sales (₹)', 'Void bills']));
  for (const d of r.daily) {
    lines.push(row([d.day, d.bills, money(d.gaming), money(d.canteen), money(d.passes), money(d.discounts), money(d.sales), d.voids]));
  }
  lines.push(
    row(['TOTAL', r.bills, money(r.gaming), money(r.canteen), money(r.passes), money(r.discounts), money(r.net_sales), r.void_count]),
  );
  lines.push('');
  lines.push(row(['Payment mode', 'Amount (₹)']));
  lines.push(row(['Cash', money(r.payments.cash)]));
  lines.push(row(['UPI', money(r.payments.upi)]));
  lines.push(row(['Card', money(r.payments.card)]));
  lines.push('');
  lines.push(row(['Top items', 'Qty', 'Amount (₹)']));
  for (const t of r.top_items) lines.push(row([t.name, t.qty, money(t.amount)]));
  return lines.join('\r\n') + '\r\n';
}

export const csvFileName = (r: { from: string; to: string }): string => `sales-${r.from}_to_${r.to}.csv`;

// ---------- chart scaling ----------

/** A tidy upper bound for an axis: 1, 2 or 5 times a power of ten (at least 1). */
export function niceMax(n: number): number {
  if (!(n > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** SVG polyline points for a series drawn left to right in a w x h box (0 at the bottom, `max` at the top). */
export function linePoints(values: number[], w: number, h: number, max: number): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(Math.max(v, 0), max) / max) * h).toFixed(1)}`)
    .join(' ');
}

/** Bar height in pixels; a non-zero value always shows at least 2 px. */
export function barHeight(value: number, max: number, h: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.max(2, (value / max) * h);
}

/** "6 pm", "12 am" */
export function hourLabel(h: number): string {
  const ap = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12} ${ap}`;
}

// ---------- revenue overview (week / 7 days / 30 days) ----------

export type RevenueRange = 'week' | 'last7' | 'last30';

export const RANGE_LABEL: Record<RevenueRange, string> = { week: 'This Week', last7: 'Last 7 days', last30: 'Last 30 days' };

const DAY_MS = 86_400_000;
const addDay = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon" for a yyyy-mm-dd date. */
export const weekdayName = (day: string): string => WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()];
/** "11 Nov" */
export const shortDate = (day: string): string => `${Number(day.slice(8, 10))} ${MONTH[Number(day.slice(5, 7)) - 1]}`;

/** Monday of the week that contains `day`. */
export function mondayOf(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDay(day, -((dow + 6) % 7));
}

export interface RangeDays {
  /** The days shown, in order (a week always has all seven, future days included). */
  days: string[];
  /** The same number of days just before them, for "vs last week". */
  prev: string[];
  /** How many of `days` are today or earlier. */
  elapsed: number;
}

export function rangeDays(range: RevenueRange, today: string): RangeDays {
  if (range === 'week') {
    const mon = mondayOf(today);
    const days = Array.from({ length: 7 }, (_, i) => addDay(mon, i));
    const elapsed = days.filter((d) => d <= today).length;
    return { days, prev: Array.from({ length: elapsed }, (_, i) => addDay(mon, i - 7)), elapsed };
  }
  const n = range === 'last7' ? 7 : 30;
  const days = Array.from({ length: n }, (_, i) => addDay(today, i - (n - 1)));
  return { days, prev: days.map((d) => addDay(d, -n)), elapsed: n };
}

/** Sales for each day of the range (null for days that have not happened yet), total, and the previous period's total. */
export function revenueSeries(
  trend: { day: string; sales: number }[],
  range: RevenueRange,
  today: string,
): { values: (number | null)[]; labels: string[]; total: number; prevTotal: number } {
  const by = new Map(trend.map((r) => [r.day, Number(r.sales)]));
  const r = rangeDays(range, today);
  const values = r.days.map((d) => (d > today ? null : (by.get(d) ?? 0)));
  const labels = r.days.map((d, i) => (range === 'last30' ? (i % 5 === 4 || i === 0 ? shortDate(d) : '') : weekdayName(d)));
  const total = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const prevTotal = r.prev.reduce((a, d) => a + (by.get(d) ?? 0), 0);
  return { values, labels, total, prevTotal };
}

/** Percent change, one decimal, or null when there is nothing to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** 20000 -> "20K", 1500 -> "1.5K", 800 -> "800" */
export function kFormat(n: number): string {
  return n >= 1000 ? `${Number((n / 1000).toFixed(1))}K` : String(Math.round(n));
}

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

/** Points for a chart in a w x h box; days without a value (null) are left out. */
export function chartPoints(values: (number | null)[], labels: string[], w: number, h: number, max: number): ChartPoint[] {
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const out: ChartPoint[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    out.push({
      x: Math.round(i * step * 10) / 10,
      y: Math.round((h - (Math.min(Math.max(v, 0), max) / max) * h) * 10) / 10,
      value: v,
      label: labels[i] ?? '',
    });
  });
  return out;
}

/** A smooth line through the points (Catmull-Rom turned into Bezier curves). */
export function smoothPath(p: { x: number; y: number }[]): string {
  if (p.length === 0) return '';
  if (p.length === 1) return `M${p[0].x},${p[0].y}`;
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

/** The line closed down to the bottom edge, for the soft fill under it. */
export function smoothArea(p: { x: number; y: number }[], h: number): string {
  return p.length < 2 ? '' : `${smoothPath(p)} L${p[p.length - 1].x},${h} L${p[0].x},${h} Z`;
}

/** Horizontal grid lines with their labels, from the bottom (0) to the top (max). */
export function yTicks(max: number, h: number, steps = 4): { y: number; label: string }[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    y: Math.round((h - (i / steps) * h) * 10) / 10,
    label: kFormat((max * i) / steps),
  }));
}

/** Initials for the live-session avatar. */
export function avatarInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
