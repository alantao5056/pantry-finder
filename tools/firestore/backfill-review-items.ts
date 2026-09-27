/**
 * One-off migration: create the `review_items` queue entry for every pending
 * `pantry_submissions` doc that doesn't have one yet.
 *
 * Since M1 of the crawler/admin work (docs/crawler-design.md), the submit
 * endpoint writes a submission AND its review item in one batch, and the
 * admin review queue only lists `review_items`. Submissions made before that
 * change have no review item, so they'd never show up in the admin.
 *
 * Idempotent: submissions already referenced by a review item are skipped, so
 * a second run is a no-op. Only creates `review_items` docs; never modifies or
 * deletes anything.
 *
 * Dry run by default — pass --apply to actually write.
 *
 *   npm run backfill-review-items:dev01
 *   npm run backfill-review-items:dev01 -- --apply
 *   npm run backfill-review-items:prod  -- --apply
 *
 * Back up the target environment (npm run backup:<env>) before using --apply
 * on prod.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applyCommand, loadCredential, requireEnvArg } from './lib.js';

async function main(): Promise<void> {
  const env = requireEnvArg();
  const apply = process.argv.includes('--apply');
  const { credential, projectId } = loadCredential();
  initializeApp({ credential });
  const db = getFirestore();

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN'}: pantry_submissions -> review_items ` +
      `(env ${env}, project ${projectId})`,
  );

  const existing = await db
    .collection('review_items')
    .where('type', '==', 'user_submission')
    .get();
  const linked = new Set(existing.docs.map((d) => d.get('submissionId') as string));

  const submissions = await db.collection('pantry_submissions').get();
  const batch = db.batch();
  let toCreate = 0;
  let skipped = 0;

  for (const doc of submissions.docs) {
    const status = doc.get('status') ?? 'pending';
    if (status !== 'pending' || linked.has(doc.id)) {
      skipped += 1;
      continue;
    }

    const createdAt = doc.get('createdAt');
    if (!(createdAt instanceof Timestamp)) {
      // The queue is ordered by createdAt; a non-Timestamp would sort apart.
      console.error(`  ${doc.id}: createdAt is not a Timestamp — run backfill-timestamps first.`);
      process.exitCode = 1;
      continue;
    }

    toCreate += 1;
    const title = String(doc.get('name') ?? '');
    const subtitle = [doc.get('city'), doc.get('state')].filter(Boolean).join(', ');
    console.log(`  ${doc.id}: ${title} (${subtitle})`);
    batch.create(db.collection('review_items').doc(), {
      type: 'user_submission',
      status: 'pending',
      title,
      subtitle,
      submissionId: doc.id,
      createdAt,
    });
  }

  if (apply && toCreate > 0) await batch.commit();

  console.log(`  submissions scanned: ${submissions.size}`);
  console.log(`  ${apply ? 'review items created' : 'review items to create'}: ${toCreate}`);
  console.log(`  skipped (not pending, or already queued): ${skipped}`);
  if (!apply && toCreate > 0) {
    console.log(`\n  Dry run only. To write these changes:\n    ${applyCommand()}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
