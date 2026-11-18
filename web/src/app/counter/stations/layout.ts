/** How many columns of station cards fit: the same breakpoints as before (phone 1, tablet 2, wide screen 3). */
export function columnCount(width: number): number {
  return width < 640 ? 1 : width < 1024 ? 2 : 3;
}

/**
 * Places the items, in order, into `cols` columns: each goes into the column that is currently shortest. Tall items
 * (a station with a session) and short ones (an unused station) therefore fill the space like bricks: with two busy
 * stations the unused ones stack up in the free third column, and when a third session starts it takes that column
 * and the unused ones move down under the others.
 */
export function distributeColumns<T>(items: T[], cols: number, weight: (item: T) => number): T[][] {
  const n = Math.max(1, Math.floor(cols));
  const columns: T[][] = Array.from({ length: n }, () => []);
  const heights = new Array<number>(n).fill(0);
  for (const item of items) {
    let best = 0;
    for (let i = 1; i < n; i++) if (heights[i] < heights[best]) best = i;
    columns[best].push(item);
    heights[best] += weight(item);
  }
  return columns;
}
