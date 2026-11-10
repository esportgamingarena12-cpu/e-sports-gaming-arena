/** Turns a Supabase / Postgres error into a short message for the user. */
export function friendlyError(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return 'Something went wrong';
  switch (e.code) {
    case '23505':
      return 'That name already exists';
    case '23514':
      return 'A value is out of the allowed range';
    case '23503':
      return 'This is used elsewhere and cannot be changed that way';
    case '42501':
      return 'Not allowed';
    default:
      return e.message || 'Something went wrong';
  }
}
