/** Bills are loaded this many at a time: 10 to start, then 10 more each time the end of the list is reached. */
export const BILLS_PAGE_SIZE = 10;

/** A full page means there may be more after it; a short one is the end of the day's bills. */
export const hasMoreBills = (returned: number, asked: number): boolean => returned >= asked;

/**
 * How many bills to ask for when the list is reloaded: at least one page, or as many as are already on screen,
 * so the automatic refresh does not shrink a list the person has scrolled down.
 */
export const rowsToFetch = (alreadyShown: number, pageSize: number = BILLS_PAGE_SIZE): number => Math.max(pageSize, alreadyShown);
