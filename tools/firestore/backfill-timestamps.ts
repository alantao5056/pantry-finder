/**
 * One-off migration: rewrite ISO-string date fields as real Firestore
 * Timestamps.
 *
 * Two collections were written with `new Date().toISOString()` instead of
 * `Timestamp.now()`, unlike users/hearts/pantries which always stored real
 * Timestamps. The schemas now declare Timestamp, so the existing documents
 * have to be converted — Firestore allows mixed types in one field, but it
 * orders by type FIRST, so strings and Timestamps form two disjoint ranges and
 * an orderBy/range query would silently miss one of them.
 *
 * Only the named field is touched (update(), not set()), and only when its
 * current value is a string, so the script is idempotent: a second run is a
 * no-op. No document is ever created or deleted.
 *
 * Dry run by default — pass --apply to actually write.
 *
 *   npm run backfill:dev01 -- search_logs searchedAt
 *   npm run backfill:dev01 -- search_logs searchedAt --apply
 *   npm run backfill:dev01 -- pantry_submissions createdAt --apply
 *   npm run backfill:prod  -- search_logs searchedAt --apply
 *
 * Back up the target environment (npm run backup:<env>) before using --apply
 * on prod.
 */
import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { applyCommand, loadCredential, requireEnvArg } from './lib.js';

/** How many converted values to print as a sample in the dry-run report. */
const SAMPLE_SIZE = 3;

interface Args {
  collection: string;
  field: string;
  apply: boolean;
}

/** requireEnvArg() consumes argv[2]; the collection and field follow it. */
function parseArgs(): Args {
  const rest = process.argv.slice(3).filter((a) => a !== '--apply');
  const apply = process.argv.includes('--apply');
  const [collection, field] = rest;
  if (!collection || !field) {
    throw new Error(
      'Usage: backfill-timestamps.ts <env> <collection> <field> [--apply]\n' +
        '  e.g. npm run backfill:dev01 -- search_logs searchedAt',
    );
  }
  // Guard against a typo silently rewriting a nested path or another field.
  if (field.includes('.') || field.includes('/')) {
    throw new Error(`Only top-level fields are supported (got ${JSON.stringify(field)}).`);
  }
  return { collection, field, apply };
}

/**
 * Convert one document's field value, or explain why it was skipped.
 * Anything that isn't a parseable ISO string is left alone rather than being
 * written back as an Invalid Date.
 */
function convert(
  doc: QueryDocumentSnapshot,
  field: string,
): { kind: 'convert'; value: Timestamp; from: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'error'; reason: string } {
  const raw = doc.get(field);
  if (raw === undefined) return { kind: 'skip', reason: 'field missing' };
  if (raw instanceof Timestamp) return { kind: 'skip', reason: 'already a Timestamp' };
  if (typeof raw !== 'string') {
    return { kind: 'error', reason: `unexpected type ${typeof raw}` };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { kind: 'error', reason: `unparseable date ${JSON.stringify(raw)}` };
  }
  return { kind: 'convert', value: Timestamp.fromDate(date), from: raw };
}

async function main(): Promise<void> {
  const env = requireEnvArg();
  const { collection, field, apply } = parseArgs();
  const { credential, projectId } = loadCredential();
  initializeApp({ credential });
  const db = getFirestore();

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN'}: ${collection}.${field} -> Timestamp ` +
      `(env ${env}, project ${projectId})`,
  );

  const snapshot = await db.collection(collection).get();
  if (snapshot.empty) {
    console.log(`  ${collection} is empty — nothing to do.`);
    return;
  }

  const writer = db.bulkWriter();
  let failed = 0;
  writer.onWriteError((err) => {
    if (err.failedAttempts < 3) return true;
    failed += 1;
    console.error(`  write failed for ${err.documentRef.path}: ${err.message}`);
    return false;
  });

  let converted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const samples: string[] = [];

  for (const doc of snapshot.docs) {
    const result = convert(doc, field);
    if (result.kind === 'skip') {
      skipped += 1;
      continue;
    }
    if (result.kind === 'error') {
      errors.push(`${doc.id}: ${result.reason}`);
      continue;
    }
    converted += 1;
    if (samples.length < SAMPLE_SIZE) {
      samples.push(`${doc.id}: ${result.from} -> ${result.value.toDate().toISOString()}`);
    }
    if (apply) {
      // onWriteError already logs terminal failures; swallow the rejection.
      void writer.update(doc.ref, { [field]: result.value }).catch(() => {});
    }
  }

  if (apply) await writer.close();

  console.log(`  scanned:   ${snapshot.size}`);
  console.log(`  ${apply ? 'converted' : 'to convert'}: ${converted}`);
  console.log(`  skipped:   ${skipped} (already a Timestamp, or field missing)`);
  for (const sample of samples) console.log(`    ${sample}`);

  if (errors.length) {
    console.error(`  SKIPPED WITH ERRORS: ${errors.length}`);
    for (const e of errors) console.error(`    ${e}`);
  }
  if (failed) {
    console.error(`  FAILED WRITES: ${failed}`);
  }
  if (!apply && converted > 0) {
    console.log(`\n  Dry run only. To write these changes:\n    ${applyCommand()}`);
  }

  if (errors.length || failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
