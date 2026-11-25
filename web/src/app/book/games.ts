/** Games for the home page: the list on the "Games available" slide and the coming-soon ticker. Pure functions. */

export interface PublicGame {
  title: string;
  /** "pc", "ps5", ... or null when the game is on every game type */
  station_type: string | null;
  hot: boolean;
  is_new: boolean;
  image_path: string | null;
}

export interface UpcomingGame {
  title: string;
  station_type: string | null;
  /** "YYYY-MM-DD" or null */
  release_date: string | null;
  note: string | null;
  image_path: string | null;
}

/** Games for one game type, or all of them. A game that is on every type shows under each filter. */
export function gamesFor(games: PublicGame[] | null | undefined, type: string | null): PublicGame[] {
  const list = games ?? [];
  return type ? list.filter((g) => g.station_type === null || g.station_type === type) : list;
}

/** "Valorant" -> "V", "  gta v" -> "G" */
export function posterInitial(title: string): string {
  const c = (title ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

const MS_DAY = 86_400_000;

/** Today's date in India as "YYYY-MM-DD". */
export function istDate(nowMs: number): string {
  return new Date(nowMs + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Whole days from today (India) to a release date: 0 = today, 1 = tomorrow, negative = already out. Null without a date. */
export function daysUntil(releaseDate: string | null | undefined, nowMs: number): number | null {
  if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return null;
  const target = Date.parse(`${releaseDate}T00:00:00Z`);
  const today = Date.parse(`${istDate(nowMs)}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  return Math.round((target - today) / MS_DAY);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-19" -> "19 Nov 2026" */
export function releaseLabel(releaseDate: string | null | undefined): string | null {
  if (!releaseDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseDate);
  if (!m) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "Out today", "Tomorrow", "in 12 days", "in 3 weeks", "in 2 months"; null when there is no date or it has passed. */
export function countdownText(releaseDate: string | null | undefined, nowMs: number): string | null {
  const d = daysUntil(releaseDate, nowMs);
  if (d === null || d < 0) return null;
  if (d === 0) return 'Out today';
  if (d === 1) return 'Tomorrow';
  if (d < 14) return `in ${d} days`;
  if (d < 60) return `in ${Math.round(d / 7)} weeks`;
  return `in ${Math.round(d / 30)} months`;
}

export interface TickerItem {
  kind: 'soon' | 'new';
  /** the whole line, e.g. "GTA VI · 19 Nov 2026 · in 3 days" */
  text: string;
}

const sameTitle = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The upcoming games that cannot be played yet. A game the shop has already added to its games list (so it is on the counter
 * and can be played) is no longer "coming soon", even if it is still on the upcoming list.
 */
export function stillComing(upcoming: UpcomingGame[] | null | undefined, games: PublicGame[] | null | undefined): UpcomingGame[] {
  const playable = games ?? [];
  return (upcoming ?? []).filter((u) => !playable.some((g) => sameTitle(g.title, u.title)));
}

/** The label of the ticker: it says what is in it ("Coming soon", "New games", or both). */
export function tickerLabel(items: TickerItem[]): string {
  const soon = items.some((i) => i.kind === 'soon');
  const fresh = items.some((i) => i.kind === 'new');
  return soon && fresh ? 'New & coming soon' : fresh ? 'New games' : 'Coming soon';
}

/**
 * The lines of the scrolling ticker: upcoming games first (soonest first, an unknown date last), then games marked
 * New that can be played now. A release date in the past is shown without the date.
 */
export function tickerItems(
  upcoming: UpcomingGame[] | null | undefined,
  games: PublicGame[] | null | undefined,
  nowMs: number,
): TickerItem[] {
  const soon: TickerItem[] = stillComing(upcoming, games).map((u) => {
    const parts = [u.title];
    const when = releaseLabel(u.release_date);
    const left = countdownText(u.release_date, nowMs);
    if (when && left) parts.push(when, left);
    else if (u.note) parts.push(u.note);
    else if (!when) parts.push('Coming soon');
    return { kind: 'soon' as const, text: parts.join(' · ') };
  });
  const fresh: TickerItem[] = (games ?? []).filter((g) => g.is_new).map((g) => ({ kind: 'new' as const, text: `${g.title} · now playing` }));
  return [...soon, ...fresh];
}

