/** What a customer sees and can download in "My data & privacy". */
export interface MyDataExport {
  exported_at: string;
  account: {
    email: string | null;
    name: string | null;
    phone: string | null;
    role: string;
    created_at: string;
    agreed_to_version: string | null;
    agreed_at: string | null;
  } | null;
  customer_record: { name: string; phone: string | null; email: string | null; created_at: string } | null;
  bookings: unknown[];
  passes: unknown[];
  bills: unknown[];
}

/** The word a customer types to confirm deleting their account. */
export const CONFIRM_WORD = 'DELETE';

/** Typed confirmation: the word, in any letter case, ignoring spaces around it. */
export const confirmMatches = (typed: string): boolean => typed.trim().toUpperCase() === CONFIRM_WORD;

/** "my-data-2026-11-23.json", dated in India time. */
export function exportFileName(now: Date = new Date()): string {
  return `my-data-${new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10)}.json`;
}

/** The download itself: readable JSON. */
export const exportText = (d: MyDataExport): string => JSON.stringify(d, null, 2);

/** The deleting error: 'PB001' means an active pass must be given up on purpose first. */
export function deleteFailure(e: { code?: string; message?: string }): { passes: boolean; text: string } {
  return { passes: e.code === 'PB001', text: e.message || 'Could not delete the account. Please try again or contact us.' };
}
