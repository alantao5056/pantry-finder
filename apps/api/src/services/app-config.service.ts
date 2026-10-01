import { db } from '../config/firebase';
import { APP_CONFIG_TTL_MS } from '../config/constants';

// Runtime switches, edited by hand in the Firebase console (no deploy needed):
//   appConfig/search → { anonymousSearchEnabled: boolean }
// A missing doc/field means enabled. Changes take effect within APP_CONFIG_TTL_MS.
const APP_CONFIG_COLLECTION = 'appConfig';
const SEARCH_DOC = 'search';

let cached: { value: boolean; fetchedAt: number } | null = null;

export async function isAnonymousSearchEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.fetchedAt < APP_CONFIG_TTL_MS) {
    return cached.value;
  }

  let value = true;
  try {
    const snap = await db.collection(APP_CONFIG_COLLECTION).doc(SEARCH_DOC).get();
    value = snap.data()?.anonymousSearchEnabled !== false;
  } catch (err) {
    // Fail open (current behavior). Cached below too, so an outage costs one
    // read per TTL rather than one per search.
    console.error('Failed to read appConfig/search, allowing anonymous search:', err);
  }

  cached = { value, fetchedAt: Date.now() };
  return value;
}
