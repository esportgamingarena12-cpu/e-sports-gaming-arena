import { columnCount, distributeColumns } from './layout';

type Card = { name: string; busy: boolean };
const weight = (c: Card): number => (c.busy ? 10 : 3);
const names = (cols: Card[][]): string[][] => cols.map((c) => c.map((x) => x.name));

describe('columnCount', () => {
  it('uses 1 column on a phone, 2 on a tablet, 3 on a wide screen', () => {
    expect(columnCount(390)).toBe(1);
    expect(columnCount(639)).toBe(1);
    expect(columnCount(640)).toBe(2);
    expect(columnCount(1023)).toBe(2);
    expect(columnCount(1024)).toBe(3);
    expect(columnCount(1920)).toBe(3);
  });
});

describe('distributeColumns (busy stations first, unused ones fill the free space)', () => {
  const busy = (n: string): Card => ({ name: n, busy: true });
  const free = (n: string): Card => ({ name: n, busy: false });

  it('with two busy stations the unused ones stack in the third column', () => {
    const cols = distributeColumns([busy('A'), busy('B'), free('U1'), free('U2'), free('U3')], 3, weight);
    expect(names(cols)).toEqual([['A'], ['B'], ['U1', 'U2', 'U3']]);
  });

  it('when a third session starts it takes the third column and the unused ones move under the others', () => {
    const cols = distributeColumns([busy('A'), busy('B'), busy('C'), free('U1'), free('U2'), free('U3'), free('U4')], 3, weight);
    expect(names(cols)).toEqual([['A', 'U1', 'U4'], ['B', 'U2'], ['C', 'U3']]);
  });

  it('keeps every item exactly once, in order within a column', () => {
    const items = [busy('A'), free('U1'), free('U2'), busy('B'), free('U3')];
    const cols = distributeColumns(items, 2, weight);
    expect(cols.flat().map((c) => c.name).sort()).toEqual(['A', 'B', 'U1', 'U2', 'U3']);
  });

  it('with one column it is simply the list', () => {
    const items = [busy('A'), free('U1')];
    expect(names(distributeColumns(items, 1, weight))).toEqual([['A', 'U1']]);
  });

  it('copes with no items and with a silly column count', () => {
    expect(distributeColumns([], 3, weight)).toEqual([[], [], []]);
    expect(distributeColumns([busy('A')], 0, weight)).toEqual([[{ name: 'A', busy: true }]]);
  });
});
