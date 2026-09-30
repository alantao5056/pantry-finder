/**
 * Address check for first-visit proposals: does the site state the pantry's
 * stored address? A cheap signal for the admin that the website really is
 * this pantry's, not a parent organization's or an unrelated site.
 *
 * Deliberately loose — house number, first street-name word and ZIP — so
 * formatting differences ("N Main Street" vs "North Main St.") still match.
 * It only decides a badge on the review page, never a write.
 */
import type { SiteCheck } from '@pantry-finder/shared';
import type { StoredPantry } from './pipeline.js';

// Suffixes and directions folded to one spelling so both sides compare equal.
const ABBREVIATIONS: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  boulevard: 'blvd',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  parkway: 'pkwy',
  highway: 'hwy',
  circle: 'cir',
  terrace: 'ter',
  trail: 'trl',
  route: 'rte',
  rt: 'rte',
  saint: 'st',
  mount: 'mt',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
  first: '1st',
  second: '2nd',
  third: '3rd',
  fourth: '4th',
  fifth: '5th',
  sixth: '6th',
  seventh: '7th',
  eighth: '8th',
  ninth: '9th',
  tenth: '10th',
};
const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
const HOUSE_NUMBER = /^\d+[a-z]?$/;
const ZIP = /^\d{5}$/;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\bp\.?\s*o\.?\s*box\b/g, 'po box')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t);
}

/**
 * First word of the street name after the house number at `from - 1`, skipping
 * directions and the rest of a number range ("123-125 Main"). A number after a
 * direction is the street itself, as in grid addresses ("2375 E 3300 S").
 */
function streetWord(toks: string[], from: number): string | undefined {
  return toks.find((t, i) => i >= from && !DIRECTIONS.has(t) && !(HOUSE_NUMBER.test(t) && HOUSE_NUMBER.test(toks[i - 1])));
}

function matches(pantry: StoredPantry, found: string): boolean {
  const stored = tokens(pantry.address1 ?? '');
  const toks = tokens(found);
  if (!stored.length) return false;

  // No house number (PO box, "Corner of …"): the whole line has to appear.
  if (!HOUSE_NUMBER.test(stored[0])) return ` ${toks.join(' ')} `.includes(` ${stored.join(' ')} `);

  const number = stored[0];
  const street = streetWord(stored, 1);
  const zip = (pantry.zipCode ?? '').trim().slice(0, 5);
  return toks.some((t, i) => {
    if (t !== number || streetWord(toks, i + 1) !== street) return false;
    // A ZIP after the street has to agree; a bare street line is accepted.
    const foundZip = toks.slice(i + 1).filter((z) => ZIP.test(z)).pop();
    return !foundZip || !zip || foundZip === zip;
  });
}

export function checkAddress(pantry: StoredPantry, found: string[]): SiteCheck {
  if (!found.length) return { status: 'not_found', found };
  return { status: found.some((a) => matches(pantry, a)) ? 'match' : 'mismatch', found };
}
