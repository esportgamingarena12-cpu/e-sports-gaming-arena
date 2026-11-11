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

export interface LiveSession {
  id: number;
  station_id: number;
  customer_name: string | null;
  started_at: string;
  paused_seconds: number;
  status: 'running' | 'paused';
}

export type StationState = 'free' | 'busy' | 'off';

/** Free (green), occupied (red) or switched off (orange) for the dashboard quick view. */
export function stationState(s: DashStation, busyIds: Set<number>): StationState {
  return !s.active ? 'off' : busyIds.has(s.id) ? 'busy' : 'free';
}

/** Minutes played so far: elapsed time minus pauses (never negative). */
export function playedMinutes(s: LiveSession, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(s.started_at)) / 60000 - s.paused_seconds / 60));
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
