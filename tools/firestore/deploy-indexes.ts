/**
 * Deploy the composite indexes in infra/firestore/firestore.indexes.json to one
 * environment from your machine — the local counterpart of the CI workflow
 * (.github/workflows/firestore-indexes.yml), which only ever targets prod.
 *
 * Dry run by default: compares the file with the indexes currently in the
 * target project and prints the plan. Pass --apply to deploy.
 *
 * Additive only, like CI: deploys without --force, so indexes that exist in
 * the project but not in the file are reported and left alone — never deleted.
 *
 *   npm run deploy-indexes:dev01                  # dry run
 *   npm run deploy-indexes:dev01 -- --apply
 *   npm run deploy-indexes:prod  -- --apply        # asks for a typed "yes"
 *
 * prod is normally handled by CI on merge to main; --apply against prod asks
 * for confirmation unless --yes is also passed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { applyCommand, loadCredential, requireEnvArg, runFirebaseTools } from './lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INFRA_DIR = path.resolve(here, '../../infra/firestore');
const INDEXES_PATH = path.join(INFRA_DIR, 'firestore.indexes.json');

interface IndexField {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
}

interface Index {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

/**
 * Identity of an index, ignoring anything firebase-tools adds on export
 * (e.g. `density`) and the implicit trailing `__name__` field.
 */
function indexKey(index: Index): string {
  const fields = index.fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? ''}`)
    .join(',');
  return `${index.collectionGroup}|${index.queryScope}|${fields}`;
}

function describe(index: Index): string {
  const fields = index.fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath} ${f.order ?? f.arrayConfig ?? ''}`.trim())
    .join(', ');
  return `${index.collectionGroup} (${fields})`;
}

function currentIndexes(projectId: string): Index[] {
  // firestore:indexes prints the same JSON shape as the infra file, possibly
  // after some log lines.
  const output = runFirebaseTools(['firestore:indexes'], { projectId });
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`Unexpected firebase firestore:indexes output:\n${output}`);
  }
  return (JSON.parse(output.slice(jsonStart)).indexes ?? []) as Index[];
}

async function confirmOrAbort(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Deploying indexes to PROD (normally done by CI). Type "yes" to continue: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const env = requireEnvArg();
  const apply = process.argv.includes('--apply');
  const yes = process.argv.includes('--yes');
  const { projectId } = loadCredential();

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN'}: ${path.relative(process.cwd(), INDEXES_PATH)} -> ` +
      `env ${env}, project ${projectId}`,
  );

  const wanted = (JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf8')).indexes ?? []) as Index[];
  const existing = currentIndexes(projectId);
  const existingKeys = new Set(existing.map(indexKey));
  const wantedKeys = new Set(wanted.map(indexKey));

  const toAdd = wanted.filter((i) => !existingKeys.has(indexKey(i)));
  const extra = existing.filter((i) => !wantedKeys.has(indexKey(i)));

  console.log(`  in file: ${wanted.length}, in project: ${existing.length}`);
  console.log(`  to add: ${toAdd.length}`);
  for (const i of toAdd) console.log(`    + ${describe(i)}`);
  if (extra.length) {
    console.log(`  in project but not in the file (left alone): ${extra.length}`);
    for (const i of extra) console.log(`    ? ${describe(i)}`);
  }

  if (toAdd.length === 0) {
    console.log('\n  Nothing to deploy.');
    return;
  }
  if (!apply) {
    console.log(`\n  Dry run only. To deploy:\n    ${applyCommand()}`);
    return;
  }

  if (env === 'prod' && !yes) await confirmOrAbort();

  // Runs from infra/firestore so firebase-tools picks up its firebase.json.
  runFirebaseTools(['deploy', '--only', 'firestore:indexes'], { projectId, cwd: INFRA_DIR });
  console.log(
    '\n  Deployed. Firestore now builds the new indexes in the background — ' +
      'queries that need them fail until the build finishes (check the ' +
      'Firebase console > Firestore > Indexes).',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
