const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** All times are shown in Asia/Kolkata (decision D13). */
export function formatIst(iso: string): string {
  return IST.format(new Date(iso));
}

const IST_LONG = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function formatIstLong(iso: string): string {
  return IST_LONG.format(new Date(iso));
}

/** Today's date (yyyy-mm-dd) in India, for date inputs. */
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Start and end (exclusive) of an India calendar day as ISO strings. */
export function istDayRange(day: string): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00+05:30`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const inr = (n: number | string): string => `₹${Number(n).toFixed(2)}`;
