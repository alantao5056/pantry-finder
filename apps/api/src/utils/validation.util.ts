// Defensive caps so a malicious payload can't bloat a Firestore doc.
export const MAX_STR = 500;
export const MAX_ABOUT = 2000;
export const MAX_ARRAY = 50;

/** Trim a value to a string, capped at `max` chars. Non-strings become ''. */
export function str(value: unknown, max = MAX_STR): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
