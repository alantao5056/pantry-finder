/**
 * Firestore backup for PantryFinder.
 *
 * Enumerates every top-level collection via listCollections() (no hardcoded
 * list — the schema has no subcollections) and streams each one into a JSONL
 * file, one document per line as {"id": ..., "data": ...} with Firestore
 * value types tagged (see lib.ts). A manifest.json records the source
 * environment, project ID, and per-collection counts for the import script.
 * The source database's composite indexes are also exported (via
 * firebase-tools, like the CI index-deploy workflow) to firestore.indexes.json
 * so the backup is self-contained; import.ts deploys them before writing data.
 *
 * Output goes to backups/<env>/<YYYY-MM-DD_HHmmss>/ so backups never collide
 * and their source environment is always visible.
 *
 *   npm run backup:dev01   (from tools/backup; uses .env.dev01)
 *   npm run backup:dev02   (uses .env.dev02)
 *   npm run backup:prod    (uses .env.prod)
 *
 * NOTE: a full backup reads every document (~14k+ reads), roughly a third of
 * the Firestore free-tier daily read quota (50k). Don't run it in a loop.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  INDEXES_FILE,
  MANIFEST_FILE,
  loadCredential,
  requireEnvArg,
  runFirebaseTools,
  serializeValue,
  type Manifest,
} from './lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function timestampSlug(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function main(): Promise<void> {
  const env = requireEnvArg();
  const { credential, projectId } = loadCredential();
  initializeApp({ credential });
  const db = getFirestore();

  const outDir = path.join(here, 'backups', env, timestampSlug(new Date()));
  fs.mkdirSync(outDir, { recursive: true });

  // Snapshot the source database's composite indexes alongside the data.
  // Done first: if firebase-tools can't run (no network to npm, bad creds for
  // the CLI), the backup fails before burning ~14k document reads.
  // firestore:indexes prints the same JSON shape as infra/firestore's file.
  const indexOutput = runFirebaseTools(['firestore:indexes'], { projectId });
  const jsonStart = indexOutput.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`Unexpected firebase firestore:indexes output:\n${indexOutput}`);
  }
  const indexes = JSON.parse(indexOutput.slice(jsonStart));
  fs.writeFileSync(
    path.join(outDir, INDEXES_FILE),
    `${JSON.stringify(indexes, null, 2)}\n`,
    'utf8',
  );
  console.log(`  indexes: ${indexes.indexes?.length ?? 0} composite -> ${INDEXES_FILE}`);

  const collections = await db.listCollections();
  const counts: Record<string, number> = {};

  for (const col of collections) {
    const outPath = path.join(outDir, `${col.id}.jsonl`);
    const out = fs.createWriteStream(outPath, 'utf8');
    let count = 0;
    for await (const doc of col.stream() as AsyncIterable<QueryDocumentSnapshot>) {
      const line = `${JSON.stringify({ id: doc.id, data: serializeValue(doc.data()) })}\n`;
      if (!out.write(line)) await once(out, 'drain');
      count += 1;
    }
    out.end();
    await once(out, 'finish');
    counts[col.id] = count;
    console.log(`  ${col.id}: ${count} docs -> ${path.basename(outPath)}`);
  }

  const manifest: Manifest = {
    source: env,
    projectId,
    createdAt: new Date().toISOString(),
    collections: counts,
  };
  fs.writeFileSync(path.join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `Backed up ${total} docs across ${collections.length} collections from ` +
      `${env} (${projectId}) to ${outDir}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
