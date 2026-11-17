import { BILLS_PAGE_SIZE, hasMoreBills, rowsToFetch } from './bills-utils';

describe('bills paging', () => {
  it('starts with 10', () => expect(BILLS_PAGE_SIZE).toBe(10));
  it('a full page may have more after it, a short one is the end', () => {
    expect(hasMoreBills(10, 10)).toBe(true);
    expect(hasMoreBills(9, 10)).toBe(false);
    expect(hasMoreBills(0, 10)).toBe(false);
  });
  it('reloads at least one page, or everything already shown', () => {
    expect(rowsToFetch(0)).toBe(10);
    expect(rowsToFetch(7)).toBe(10);
    expect(rowsToFetch(30)).toBe(30);
  });
});
