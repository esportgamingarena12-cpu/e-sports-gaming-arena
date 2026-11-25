import { describe, expect, it } from 'vitest';
import { countdownText, daysUntil, gamesFor, istDate, posterInitial, PublicGame, releaseLabel, stillComing, tickerItems, tickerLabel, UpcomingGame } from './games';

const game = (title: string, station_type: string | null, over: Partial<PublicGame> = {}): PublicGame => ({
  title,
  station_type,
  hot: false,
  is_new: false,
  image_path: null,
  ...over,
});
const soon = (title: string, release_date: string | null, over: Partial<UpcomingGame> = {}): UpcomingGame => ({
  title,
  station_type: null,
  release_date,
  note: null,
  image_path: null,
  ...over,
});

// 2026-11-16 12:00 in India (06:30 UTC)
const NOW = Date.parse('2026-11-16T06:30:00Z');

describe('games by platform', () => {
  const list = [game('Valorant', 'pc'), game('Tekken 8', 'ps5'), game('GTA V', null)];
  it('shows every game with no filter', () => expect(gamesFor(list, null).map((g) => g.title)).toEqual(['Valorant', 'Tekken 8', 'GTA V']));
  it('a filter keeps that platform and the games on every platform', () => {
    expect(gamesFor(list, 'pc').map((g) => g.title)).toEqual(['Valorant', 'GTA V']);
    expect(gamesFor(list, 'ps5').map((g) => g.title)).toEqual(['Tekken 8', 'GTA V']);
  });
  it('copes with nothing', () => {
    expect(gamesFor(null, 'pc')).toEqual([]);
    expect(gamesFor(undefined, null)).toEqual([]);
  });
  it('poster letter', () => {
    expect(posterInitial('valorant')).toBe('V');
    expect(posterInitial('  gta v')).toBe('G');
    expect(posterInitial('')).toBe('?');
  });
});

describe('release dates', () => {
  it('works from the India date, not the UTC one', () => {
    // 20:00 UTC on the 16th is already 01:30 on the 17th in India
    expect(istDate(Date.parse('2026-11-16T20:00:00Z'))).toBe('2026-11-17');
    expect(istDate(NOW)).toBe('2026-11-16');
  });
  it('counts whole days from today', () => {
    expect(daysUntil('2026-11-16', NOW)).toBe(0);
    expect(daysUntil('2026-11-17', NOW)).toBe(1);
    expect(daysUntil('2026-11-19', NOW)).toBe(3);
    expect(daysUntil('2026-11-15', NOW)).toBe(-1);
    expect(daysUntil('2026-11-17', Date.parse('2026-11-16T20:00:00Z'))).toBe(0);
  });
  it('has no count without a valid date', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('', NOW)).toBeNull();
    expect(daysUntil('soon', NOW)).toBeNull();
  });
  it('formats a date', () => {
    expect(releaseLabel('2026-11-19')).toBe('19 Nov 2026');
    expect(releaseLabel('2027-01-05')).toBe('5 Jan 2027');
    expect(releaseLabel(null)).toBeNull();
    expect(releaseLabel('nope')).toBeNull();
  });
  it('words the countdown', () => {
    expect(countdownText('2026-11-16', NOW)).toBe('Out today');
    expect(countdownText('2026-11-17', NOW)).toBe('Tomorrow');
    expect(countdownText('2026-11-28', NOW)).toBe('in 12 days');
    expect(countdownText('2026-12-14', NOW)).toBe('in 4 weeks');
    expect(countdownText('2027-03-16', NOW)).toBe('in 4 months');
  });
  it('says nothing for a date that has passed or none at all', () => {
    expect(countdownText('2026-11-01', NOW)).toBeNull();
    expect(countdownText(null, NOW)).toBeNull();
  });
});

describe('ticker', () => {
  it('lists upcoming games with date and countdown', () => {
    const items = tickerItems([soon('GTA VI', '2026-11-19')], [], NOW);
    expect(items).toEqual([{ kind: 'soon', text: 'GTA VI · 19 Nov 2026 · in 3 days' }]);
  });
  it('uses the note when there is no date, and "Coming soon" when there is neither', () => {
    expect(tickerItems([soon('Game A', null, { note: 'Later this year' })], [], NOW)[0].text).toBe('Game A · Later this year');
    expect(tickerItems([soon('Game B', null)], [], NOW)[0].text).toBe('Game B · Coming soon');
  });
  it('a date that has passed falls back to the note', () => {
    expect(tickerItems([soon('Old', '2026-10-01', { note: 'Out now elsewhere' })], [], NOW)[0].text).toBe('Old · Out now elsewhere');
    expect(tickerItems([soon('Old2', '2026-10-01')], [], NOW)[0].text).toBe('Old2');
  });
  it('then adds the games marked New that can be played now', () => {
    const items = tickerItems(
      [soon('GTA VI', null)],
      [game('Valorant', 'pc'), game('EA FC', 'ps5', { is_new: true })],
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(['soon', 'new']);
    expect(items[1].text).toBe('EA FC · now playing');
  });
  it('is empty with nothing coming and nothing new', () => {
    expect(tickerItems([], [game('Valorant', 'pc')], NOW)).toEqual([]);
    expect(tickerItems(null, null, NOW)).toEqual([]);
  });
});

describe('a game that can already be played is not "coming soon"', () => {
  it('drops an upcoming game that is also in the games list (same title, any capitals or spaces)', () => {
    const up = [soon('GTA VI', null), soon('Other Game', null)];
    expect(stillComing(up, [game(' gta vi ', 'pc', { is_new: true })]).map((u) => u.title)).toEqual(['Other Game']);
    expect(stillComing(up, []).length).toBe(2);
    expect(stillComing(null, null)).toEqual([]);
  });
  it('the ticker then shows it once, as now playing, not as coming soon', () => {
    const items = tickerItems([soon('GTA VI', null)], [game('GTA VI', 'pc', { is_new: true })], NOW);
    expect(items.map((i) => i.text)).toEqual(['GTA VI · now playing']);
    expect(items[0].kind).toBe('new');
  });
  it('the ticker label says what is in it', () => {
    expect(tickerLabel(tickerItems([soon('A', null)], [], NOW))).toBe('Coming soon');
    expect(tickerLabel(tickerItems([], [game('B', 'pc', { is_new: true })], NOW))).toBe('New games');
    expect(tickerLabel(tickerItems([soon('A', null)], [game('B', 'pc', { is_new: true })], NOW))).toBe('New & coming soon');
  });
});
