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
