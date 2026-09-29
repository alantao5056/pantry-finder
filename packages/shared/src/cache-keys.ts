// Redis keys of the API caches that hold pantry data. Shared so anything that
// writes pantries outside the API (tools/crawler) clears exactly the entries
// the API reads.

import { slugify } from './slug.js';
import { isValidStateSlug } from './states.js';

export const CACHE_PREFIX = {
  /** Pantry detail by doc id (`GET /pantries/:id`). */
  pantryById: 'pf:pantry:id:',
  /** Full pantry list of one browse-index city, keyed by `cityIndexKey`. */
  cityPantries: 'pf:city:pantries:',
} as const;

/**
 * `${stateSlug}_${citySlug}` — the `cities` doc id tools/sitemap writes, and
 * the city caches' key. Null when the pantry can't be in the browse index.
 */
export function cityIndexKey(state: string, city: string): string | null {
  // Same rule as tools/sitemap/generate-sitemap.ts, which builds these keys.
  const stateSlug = state.trim().toLowerCase();
  const citySlug = slugify(city.trim());
  return citySlug && isValidStateSlug(stateSlug) ? `${stateSlug}_${citySlug}` : null;
}

/** Full Redis keys of every API cache entry that holds this pantry. */
export function pantryCacheKeys(pantry: { id: string; state: string; city: string }): string[] {
  const keys = [CACHE_PREFIX.pantryById + pantry.id];
  const city = cityIndexKey(pantry.state, pantry.city);
  if (city) keys.push(CACHE_PREFIX.cityPantries + city);
  return keys;
}
