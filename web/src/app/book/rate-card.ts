import { typeLabel } from './portal';

/** Public rate card and opening hours for the home page. Pure functions: no data is invented, no data means no card. */

export interface PublicPackage {
  name: string;
  minutes: number;
  price: number;
  station_type: string;
}

export interface OpeningDay {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** "HH:MM", 24 hour */
  open: string;
  close: string;
  closed: boolean;
}

export interface RateRow {
  /** e.g. "PC" or "PS5 2 Players" */
  label: string;
  station_type: string;
  /** price by package minutes */
  prices: Record<number, number>;
}

export interface RateCard {
  /** the package lengths, shortest first (e.g. 30 and 60) */
  minutes: number[];
  rows: RateRow[];
}

const DURATION_SUFFIX = /\s+\d+\s*(?:min(?:ute)?s?|h(?:ou)?rs?)\s*$/i;

/** "PS5 2 Players 30 Min" -> "PS5 2 Players". A name without a length stays as it is. */
export function packageBase(name: string): string {
  const base = name.replace(DURATION_SUFFIX, '').trim();
  return base || name.trim();
}

/**
 * The row a package belongs to. "PC 30 Minutes" and "PC 1 Hour" share the row "PC". A name that does not end in a
 * length (for example "PC 1" or "Night pack") cannot be grouped by its name, so it joins its game's row ("PC").
 */
export function rowLabel(p: { name: string; station_type: string }): string {
  const name = p.name.trim();
  const base = packageBase(name);
  return base !== name && base ? base : typeLabel(p.station_type);
}

/** "30 Minutes", "1 Hour", "1 h 30 min", "2 Hours" */
export function minutesLabel(m: number): string {
  if (m < 60) return `${m} Minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return h === 1 ? '1 Hour' : `${h} Hours`;
  return `${h} h ${r} min`;
}

/**
 * Groups the fixed-price packages into rows (one per game and player count) and columns (one per length).
 * Rows keep the order of the packages, which the server sorts by game type, length and price.
 */
export function buildRateCard(packages: PublicPackage[] | null | undefined): RateCard | null {
  const list = (packages ?? []).filter((p) => Number(p.minutes) > 0 && Number(p.price) >= 0);
  if (list.length === 0) return null;
  const rows = new Map<string, RateRow>();
  const lengths = new Set<number>();
  for (const p of list) {
    const label = rowLabel(p);
    const key = `${p.station_type}|${label}`;
    const row = rows.get(key) ?? { label, station_type: p.station_type, prices: {} };
    row.prices[Number(p.minutes)] = Number(p.price);
    rows.set(key, row);
    lengths.add(Number(p.minutes));
  }
  return { minutes: [...lengths].sort((a, b) => a - b), rows: [...rows.values()] };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday first, the way a shop talks about its week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "12:00" -> "12:00 pm", "22:00" -> "10:00 pm", "00:00" -> "12:00 am" */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}

export interface HoursGroup {
  /** "Mon – Fri" */
  days: string;
  /** "12:00 pm – 10:00 pm", or "Closed" */
  time: string;
  /** the weekdays in this group (0 = Sunday), so today's group can be highlighted */
  weekdays: number[];
}

/** Opening hours grouped by identical days: [{ days: "Mon – Fri", time: "12:00 pm – 10:00 pm", weekdays: [1,2,3,4,5] }, ...] */
export function hoursSummary(days: OpeningDay[] | null | undefined): HoursGroup[] {
  const byDay = new Map((days ?? []).map((d) => [d.weekday, d]));
  const groups: { first: number; last: number; time: string; weekdays: number[] }[] = [];
  for (const wd of WEEK_ORDER) {
    const d = byDay.get(wd);
    if (!d) continue;
    const time = d.closed ? 'Closed' : `${timeLabel(d.open)} – ${timeLabel(d.close)}`;
    const prev = groups[groups.length - 1];
    if (prev && prev.time === time) {
      prev.last = wd;
      prev.weekdays.push(wd);
    } else groups.push({ first: wd, last: wd, time, weekdays: [wd] });
  }
  return groups.map((g) => ({
    days: g.first === g.last ? DAY_NAMES[g.first] : `${DAY_NAMES[g.first]} – ${DAY_NAMES[g.last]}`,
    time: g.time,
    weekdays: g.weekdays,
  }));
}

/** The weekday (0 = Sunday) and minutes since midnight in India at a moment. */
export function istParts(nowMs: number): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return {
    weekday: DAY_NAMES.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export interface OpenStatus {
  open: boolean;
  /** "Open now · closes 10:00 pm", "Opens today at 12:00 pm", "Opens tomorrow at 11:00 am", "Opens Sat at 11:00 am" */
  text: string;
  /** today's weekday in India (0 = Sunday) */
  today: number;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return h * 60 + (m ?? 0);
};

/** Is the shop open at this moment (India time), and when does it open or close next? Null without hours. */
export function openStatus(days: OpeningDay[] | null | undefined, nowMs: number): OpenStatus | null {
  const byDay = new Map((days ?? []).map((d) => [d.weekday, d]));
  if (byDay.size === 0) return null;
  const { weekday, minutes } = istParts(nowMs);
  const today = byDay.get(weekday);
  if (today && !today.closed) {
    if (minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
      return { open: true, text: `Open now · closes ${timeLabel(today.close)}`, today: weekday };
    }
    if (minutes < toMinutes(today.open)) {
      return { open: false, text: `Opens today at ${timeLabel(today.open)}`, today: weekday };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const wd = (weekday + i) % 7;
    const d = byDay.get(wd);
    if (d && !d.closed) {
      const when = i === 1 ? 'tomorrow' : DAY_NAMES[wd];
      return { open: false, text: `Opens ${when} at ${timeLabel(d.open)}`, today: weekday };
    }
  }
  return { open: false, text: 'Closed', today: weekday };
}

/** Whole-number percentage saved against the "was" price, or null when there is no discount. */
export function savePercent(price: number, was: number | null | undefined): number | null {
  if (was === null || was === undefined || !(was > price) || price < 0) return null;
  return Math.round((1 - price / was) * 100);
}

export interface GameHighlight {
  type: string;
  /** "PC", "PS5" */
  label: string;
  icon: 'monitor' | 'gamepad';
  /** the lowest starting price, or null when nothing is priced */
  price: number | null;
  /** what the price covers: "30 min", "hour", "2 hours" */
  per: string;
  /** "Up to 4 players", "Per PC seat" or empty */
  note: string;
}

const perText = (m: number): string => (m % 60 === 0 ? (m === 60 ? 'hour' : `${m / 60} hours`) : `${m} min`);

/**
 * One highlight per game on offer: its cheapest starting price (the shortest package, else the hourly rate) and a
 * short note. Players are read from the package names ("PS5 4 Players 1 Hour" -> "Up to 4 players").
 */
export function gameHighlights(
  info: { types: string[]; rates: { type: string; rate_per_hour: number }[]; packages: PublicPackage[] } | null | undefined,
): GameHighlight[] {
  if (!info) return [];
  return (info.types ?? []).map((t) => {
    const pk = (info.packages ?? []).filter((p) => p.station_type === t && Number(p.minutes) > 0);
    let price: number | null = null;
    let per = 'hour';
    if (pk.length) {
      const shortest = Math.min(...pk.map((p) => Number(p.minutes)));
      price = Math.min(...pk.filter((p) => Number(p.minutes) === shortest).map((p) => Number(p.price)));
      per = perText(shortest);
    } else {
      const rates = (info.rates ?? []).filter((r) => r.type === t).map((r) => Number(r.rate_per_hour));
      price = rates.length ? Math.min(...rates) : null;
    }
    const players = pk.map((p) => Number(/(\d+)\s*players?/i.exec(p.name)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0);
    const note = players > 0 ? `Up to ${players} player${players === 1 ? '' : 's'}` : t === 'pc' ? 'Per PC seat' : '';
    return { type: t, label: typeLabel(t), icon: t === 'pc' ? 'monitor' : 'gamepad', price, per, note };
  });
}
