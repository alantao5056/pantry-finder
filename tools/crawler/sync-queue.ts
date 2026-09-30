/**
 * Syncs the crawl queue (see select.ts): a pantry is in it iff its
 * `lastCrawledAt` field is present, and it belongs in it iff it has a usable
 * website on a site no other pantry uses. This script reconciles the two:
 *
 *   belongs, field absent     → lastCrawledAt: null (never crawled; goes first)
 *   doesn't belong, field set → lastCrawledAt deleted
 *
 * Existing timestamps are kept, so it's idempotent. Run it once to set up the
 * crawl queue, and again after a pantry re-import or whenever websites have
 * changed a lot (it's what notices a site becoming shared). About 2 reads per
 * pantry with a website. Dry run by default (prints the counts, writes nothing).
 *
 *   npm run sync-queue:dev01 [-- --apply]
 */
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@pantry-finder/shared/firestore';
import { applyCommand, hasFlag, initFirestore, requireEnvArg } from './lib.js';
import { allCrawlTargets } from './select.js';

const SAMPLE_SIZE = 5;

const env = requireEnvArg();
const apply = hasFlag('apply');
const { db, projectId } = initFirestore();
console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: sync crawl queue (env ${env}, project ${projectId})`);

const targets = await allCrawlTargets(db);
const belongs = new Set(targets.map((t) => t.id));
const queued = (await db.collection(COLLECTIONS.pantries).orderBy('lastCrawledAt').get()).docs;
const inQueue = new Set(queued.map((d) => d.id));

const toAdd = targets.filter((t) => !inQueue.has(t.id));
const toRemove = queued.filter((d) => !belongs.has(d.id));

const describe = (d: QueryDocumentSnapshot) => `${d.id} ${JSON.stringify(d.get('website') ?? null)}`;
console.log(`${targets.length} pantries belong in the crawl queue; ${queued.length} are in it now.`);
console.log(`Add ${toAdd.length}:`);
for (const t of toAdd.slice(0, SAMPLE_SIZE)) console.log(`  ${t.id} ${t.url}`);
console.log(`Remove ${toRemove.length}:`);
for (const d of toRemove.slice(0, SAMPLE_SIZE)) console.log(`  ${describe(d)}`);

if (!apply) {
  if (toAdd.length || toRemove.length) console.log(`\nDry run only. To write these changes:\n  ${applyCommand()}`);
} else {
  const writer = db.bulkWriter();
  let failed = 0;
  writer.onWriteError((err) => {
    if (err.failedAttempts < 3) return true;
    failed++;
    console.warn(`  ${err.documentRef.id}: ${err.message}`);
    return false;
  });
  const pantries = db.collection(COLLECTIONS.pantries);
  for (const t of toAdd) void writer.update(pantries.doc(t.id), { lastCrawledAt: null });
  for (const d of toRemove) void writer.update(d.ref, { lastCrawledAt: FieldValue.delete() });
  await writer.close();
  console.log(`Done: ${toAdd.length + toRemove.length - failed} written, ${failed} failed.`);
}
