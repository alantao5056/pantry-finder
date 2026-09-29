/**
 * Which pantries the crawler visits: those with a usable website on a site no
 * other pantry uses. Hosts shared by several pantries are food-bank listing
 * pages, handled in M4.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@pantry-finder/shared/firestore';
import { siteOf } from './fetch/fetcher.js';
import type { StoredPantry } from './pipeline.js';
import { normalizeWebsite } from './site.js';

// Sites behind a login wall whose terms forbid scraping.
const EXCLUDED_SITES = ['facebook.com', 'm.facebook.com', 'instagram.com'];

export interface CrawlTarget {
  id: string;
  pantry: StoredPantry;
  url: string;
}

/**
 * Least recently crawled first (never-crawled before all), then by id, so
 * successive limited runs rotate through every site. With `pantryId`, just
 * that pantry (the caller vouches it's single-site).
 */
export async function selectPantries(db: Firestore, pantryId?: string): Promise<CrawlTarget[]> {
  // Only pantries with a website are read (~3.8k docs, not the whole collection).
  const docs = pantryId
    ? [await db.collection(COLLECTIONS.pantries).doc(pantryId).get()].filter((d) => d.exists)
    : (await db.collection(COLLECTIONS.pantries).where('website', '>', '').get()).docs;
  const withSite = docs
    .map((d) => {
      const pantry = d.data() as StoredPantry;
      return { id: d.id, pantry, url: normalizeWebsite(pantry.website ?? '') };
    })
    .filter((p): p is CrawlTarget => p.url !== null)
    .filter((p) => !EXCLUDED_SITES.includes(siteOf(p.url)));

  const perSite = new Map<string, number>();
  for (const p of withSite) perSite.set(siteOf(p.url), (perSite.get(siteOf(p.url)) ?? 0) + 1);
  return withSite
    .filter((p) => pantryId || perSite.get(siteOf(p.url)) === 1)
    .sort((a, b) => crawledMs(a) - crawledMs(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function crawledMs(p: CrawlTarget): number {
  return p.pantry.lastCrawledAt?.toMillis() ?? 0;
}
