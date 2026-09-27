/**
 * Firestore import (restore) for PantryFinder.
 *
 * Reads a backup folder produced by backup.ts and writes its collections into
 * the environment selected by the npm script. Firestore value tags in the
 * JSONL are restored to real Timestamp/GeoPoint/etc. values (see lib.ts).
 * If the backup contains a firestore.indexes.json snapshot, its composite
 * indexes are deployed to the target first (additive — firebase-tools without
 * --force never deletes existing indexes), so restoring into a brand-new
 * database also sets up the indexes its queries need.
 *
 *   npm run import:dev01 -- <backup-folder> [--collections a,b] [--replace] [--yes]
 *   npm run import:dev02 -- <backup-folder> [--collections a,b] [--replace] [--yes]
 *   npm run import:prod  -- <backup-folder> [--collections a,b] [--replace] [--yes]
 *
 * <backup-folder>  path to a backups/<env>/<timestamp>/ folder (relative paths
 *                  resolve from tools/firestore, npm's working directory)
 * --collections    comma-separated subset to import; defaults to every
 *                  <name>.jsonl in the folder
 * --replace        mirror restore: after upserting, delete target docs whose
 *                  IDs are not in the backup (default is upsert-only)
 * --yes            skip the interactive confirmation
 *
 * Before writing anything it prints the target project, mode, and collection
 * list, highlights cross-environment imports (e.g. prod backup -> dev01), and
 * asks for confirmation.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  INDEXES_FILE,
  MANIFEST_FILE,
  deserializeValue,
  loadCredential,
  requireEnvArg,
  runFirebaseTools,
  type Env,
  type Manifest,
} from './lib.js';

interface ImportArgs {
  sourceDir: string;
  collections: string[];
  replace: boolean;
  yes: boolean;
}

function parseImportArgs(): ImportArgs {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3), // argv[2] is the env baked into the npm script
    options: {
      collections: { type: 'string' },
      replace: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const source = positionals[0];
  if (!source) {
    throw new Error(
      'Missing backup folder. Usage: npm run import:<env> -- <backup-folder> ' +
        '[--collections a,b] [--replace] [--yes]',
    );
  }
  const sourceDir = path.resolve(source);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Backup folder not found: ${sourceDir}`);
  }

  const available = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.slice(0, -'.jsonl'.length));
  if (available.length === 0) {
    throw new Error(`No .jsonl collection files in ${sourceDir} — is this a backup folder?`);
  }

  let collections = available.sort();
  if (values.collections) {
    collections = values.collections.split(',').map((c) => c.trim()).filter(Boolean);
    const missing = collections.filter((c) => !available.includes(c));
    if (missing.length > 0) {
      throw new Error(
        `Collection(s) not in the backup: ${missing.join(', ')}. Available: ${available.join(', ')}`,
      );
    }
  }

  return { sourceDir, collections, replace: values.replace, yes: values.yes };
}

function readManifest(sourceDir: string): Manifest {
  const manifestPath = path.join(sourceDir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `${MANIFEST_FILE} not found in ${sourceDir}. Only folders written by backup.ts can be imported.`,
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function confirmOrAbort(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type "yes" to continue: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted — nothing was written.');
    process.exit(1);
  }
}

// Deploy the backup's composite-index snapshot to the target project.
// `firebase deploy` needs a firebase.json next to the indexes file, so both
// are staged in a temp dir — the backup folder stays untouched.
function deployIndexes(sourceDir: string, projectId: string): void {
  const src = path.join(sourceDir, INDEXES_FILE);
  if (!fs.existsSync(src)) {
    console.log(`  no ${INDEXES_FILE} in the backup (pre-index-support backup?) — skipping index deploy`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pantry-backup-indexes-'));
  try {
    fs.copyFileSync(src, path.join(tmp, INDEXES_FILE));
    fs.writeFileSync(
      path.join(tmp, 'firebase.json'),
      `${JSON.stringify({ firestore: { indexes: INDEXES_FILE } }, null, 2)}\n`,
      'utf8',
    );
    runFirebaseTools(['deploy', '--only', 'firestore:indexes'], { projectId, cwd: tmp });
    console.log('  indexes deployed (additive; extra indexes already on the target are kept)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function backupIndexCount(sourceDir: string): number | null {
  const src = path.join(sourceDir, INDEXES_FILE);
  if (!fs.existsSync(src)) return null;
  const json = JSON.parse(fs.readFileSync(src, 'utf8'));
  return Array.isArray(json.indexes) ? json.indexes.length : 0;
}

async function importCollection(
  db: Firestore,
  sourceDir: string,
  name: string,
  replace: boolean,
): Promise<void> {
  const col = db.collection(name);
  const writer = db.bulkWriter();
  let failed = 0;
  writer.onWriteError((err) => {
    if (err.failedAttempts < 3) return true;
    failed += 1;
    console.error(`  write failed for ${err.documentRef.path}: ${err.message}`);
    return false;
  });

  const lines = readline.createInterface({
    input: fs.createReadStream(path.join(sourceDir, `${name}.jsonl`), 'utf8'),
    crlfDelay: Infinity,
  });
  const importedIds = new Set<string>();
  for await (const line of lines) {
    if (!line.trim()) continue;
    const { id, data } = JSON.parse(line) as { id: string; data: unknown };
    importedIds.add(id);
    // onWriteError already logged terminal failures; swallow the rejection.
    void writer.set(col.doc(id), deserializeValue(data, db) as Record<string, unknown>).catch(() => {});
  }

  let deleted = 0;
  if (replace) {
    // listDocuments() returns refs without reading document data, so the
    // stale-doc diff doesn't burn reads (same pattern as the sitemap tool).
    const refs = await col.listDocuments();
    for (const ref of refs) {
      if (!importedIds.has(ref.id)) {
        void writer.delete(ref).catch(() => {});
        deleted += 1;
      }
    }
  }

  await writer.close();
  console.log(
    `  ${name}: ${importedIds.size} docs written` +
      (replace ? `, ${deleted} stale docs deleted` : '') +
      (failed > 0 ? `, ${failed} FAILED` : ''),
  );
  if (failed > 0) {
    throw new Error(`${failed} writes failed in '${name}' — the collection may be partially imported.`);
  }
}

async function main(): Promise<void> {
  const targetEnv: Env = requireEnvArg();
  const args = parseImportArgs();
  const manifest = readManifest(args.sourceDir);
  const { credential, projectId } = loadCredential();
  initializeApp({ credential });
  const db = getFirestore();

  console.log('Import plan:');
  console.log(`  target:      ${targetEnv} (project ${projectId})`);
  console.log(`  source:      ${args.sourceDir}`);
  console.log(`               backed up from ${manifest.source} (project ${manifest.projectId}) at ${manifest.createdAt}`);
  console.log(`  mode:        ${args.replace ? 'REPLACE (mirror restore — extra target docs will be DELETED)' : 'upsert (existing extra docs are kept)'}`);
  console.log(
    `  collections: ${args.collections
      .map((c) => `${c} (${manifest.collections[c] ?? '?'} docs)`)
      .join(', ')}`,
  );
  const indexCount = backupIndexCount(args.sourceDir);
  console.log(
    `  indexes:     ${
      indexCount === null
        ? 'none in backup — index deploy will be skipped'
        : `${indexCount} composite index(es) will be deployed first (additive)`
    }`,
  );
  if (manifest.source !== targetEnv) {
    console.warn(
      `\n  *** CROSS-ENVIRONMENT IMPORT: ${manifest.source} backup -> ${targetEnv} database ***`,
    );
  }
  console.log('');

  if (!args.yes) await confirmOrAbort();

  deployIndexes(args.sourceDir, projectId);

  for (const name of args.collections) {
    await importCollection(db, args.sourceDir, name, args.replace);
  }

  console.log(`Imported ${args.collections.length} collection(s) into ${targetEnv} (${projectId}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
