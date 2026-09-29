/**
 * Phone check for first-visit proposals: does the site list the pantry's
 * stored phone number? Like the address check (address.ts), a badge for the
 * admin deciding whether the site is this pantry's, never a write.
 */
import type { SiteCheck } from '@pantry-finder/shared';
import type { StoredPantry } from './pipeline.js';

/** The 10-digit US number in a phone string, ignoring formatting, a leading 1 and extensions. */
function phoneDigits(text: string): string | undefined {
  const main = text.split(/\s*(?:ext\.?|extension|x)\s*\d/i)[0] ?? '';
  const digits = main.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : undefined;
}

/** Undefined when the pantry has no stored phone to compare against. */
export function checkPhone(pantry: StoredPantry, found: string[]): SiteCheck | undefined {
  const stored = phoneDigits(pantry.phone ?? '');
  if (!stored) return undefined;
  if (!found.length) return { status: 'not_found', found };
  return { status: found.some((p) => phoneDigits(p) === stored) ? 'match' : 'mismatch', found };
}
