/**
 * Which pantries the crawler visits: those with a usable website on a site no
 * other pantry uses. Hosts shared by several pantries are food-bank listing
 * pages, handled in M4.
 *
 * The crawl queue is the `lastCrawledAt` field itself: a pantry is in it iff the
 * field is present (null = never crawled, which sorts first). Deciding who is
 * in needs every pantry's site, so it's done by sync-queue.ts (a full scan, run
 * by hand) instead of on every run; the API adds a pantry whose website is
 * set, and removes it when the website is cleared.
 */
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@pantry-finder/shared/firestore';
import { siteOf } from './fetch/fetcher.js';
import type { StoredPantry } from './pipeline.js';
import { normalizeWebsite } from './site.js';

// Sites behind a login wall whose terms forbid scraping.
const EXCLUDED_SITES = ['facebook.com', 'm.facebook.com', 'instagram.com'];

// Extra docs per page, for queue entries that no longer qualify (sites that
// became shared, or unusable websites, since the last sync-queue run).
const PAGE_MARGIN = 20;

export interface CrawlTarget {
  id: string;
  pantry: StoredPantry;
  url: string;
}

/** The pantry as a target if its website is usable and not excluded; shared sites aren't checked. */
function toTarget(doc: DocumentSnapshot): CrawlTarget | null {
  const pantry = doc.data() as StoredPantry | undefined;
  const url = pantry && normalizeWebsite(pantry.website ?? '');
  if (!pantry || !url || EXCLUDED_SITES.includes(siteOf(url))) return null;
  return { id: doc.id, pantry, url };
}

/**
 * The `limit` least recently crawled pantries of the crawl queue (never-crawled
 * first, then by id), so successive runs rotate through every site. With
 * `pantryId`, just that pantry (the caller vouches it's single-site).
 */
export async function selectPantries(db: Firestore, limit: number, pantryId?: string): Promise<CrawlTarget[]> {
  const pantries = db.collection(COLLECTIONS.pantries);
  if (pantryId) {
    const target = toTarget(await pantries.doc(pantryId).get());
    return target ? [target] : [];
  }

  const pageSize = limit + PAGE_MARGIN;
  const targets: CrawlTarget[] = [];
  let last: DocumentSnapshot | undefined;
  for (;;) {
    // Ties (all the never-crawled nulls) are ordered by document id.
    let query = pantries.orderBy('lastCrawledAt').limit(pageSize);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    for (const doc of snap.docs) {
      const target = toTarget(doc);
      if (target) targets.push(target);
      if (targets.length === limit) return targets;
    }
    if (snap.size < pageSize) return targets;
    last = snap.docs[snap.docs.length - 1];
  }
}

/**
 * Every pantry that belongs in the crawl queue, from a scan of all pantries with
 * a website (~3.8k reads). For sync-queue.ts and compare-tiers.ts only — never
 * per crawl run.
 */
export async function allCrawlTargets(db: Firestore): Promise<CrawlTarget[]> {
  const snap = await db.collection(COLLECTIONS.pantries).where('website', '>', '').get();
  const withSite = snap.docs.map(toTarget).filter((t): t is CrawlTarget => t !== null);
  const perSite = new Map<string, number>();
  for (const t of withSite) perSite.set(siteOf(t.url), (perSite.get(siteOf(t.url)) ?? 0) + 1);
  return withSite.filter((t) => perSite.get(siteOf(t.url)) === 1);
}
