import { CACHE_PREFIX, cityIndexKey, Pantry } from '@pantry-finder/shared';
import type { PantryLocation } from '@pantry-finder/shared/firestore';
import { Cache } from './Cache';
import { createCache } from './createCache';

// The caches that hold pantry data, as process-wide singletons: the services
// that read them and the admin writes that invalidate them must share one
// instance (with the in-memory fallback, separate instances never see each
// other's deletes). Created on first use, after env has loaded.

let byId: Cache<Pantry> | null = null;
let byCity: Cache<Pantry[]> | null = null;

/** Pantry detail by doc id (`GET /pantries/:id`). */
export function pantryByIdCache(): Cache<Pantry> {
  byId ??= createCache<Pantry>(CACHE_PREFIX.pantryById, {
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 10000,
  });
  return byId;
}

/** Full (unpaginated) pantry list per browse-index city, keyed by `cityIndexKey`. */
export function cityPantriesCache(): Cache<Pantry[]> {
  byCity ??= createCache<Pantry[]>(CACHE_PREFIX.cityPantries, {
    ttlMs: 48 * 60 * 60 * 1000, // 48 hours, like the rest of the browse index
    max: 4000,
  });
  return byCity;
}

/**
 * Drops every cached copy of a pantry after it was written, so the public site
 * shows the change right away. tools/crawler clears the same Redis keys
 * (`pantryCacheKeys`) for its own writes.
 */
export async function invalidatePantryCaches(pantry: PantryLocation): Promise<void> {
  await pantryByIdCache().delete(pantry.id);
  const city = cityIndexKey(pantry.state, pantry.city);
  if (city) await cityPantriesCache().delete(city);
}
