/**
 * Shared helpers for the backup/import tool: credential loading, environment
 * argument parsing, and (de)serialization of Firestore-specific value types.
 *
 * Firestore documents contain values JSON can't represent (Timestamp on
 * users/hearts, GeoPoint on pantries.coordinates). Backups tag them as
 * `{"__fs": "<type>", ...}` objects so an import can restore the real types —
 * restoring a GeoPoint as a plain object would silently break GeoFirestore
 * radius queries.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cert, type Credential } from 'firebase-admin/app';
import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';

export const ENVS = ['dev01', 'dev02', 'prod'] as const;
export type Env = (typeof ENVS)[number];

export interface LoadedCredential {
  credential: Credential;
  projectId: string;
}

/** Name of the metadata file written alongside the per-collection JSONL files. */
export const MANIFEST_FILE = 'manifest.json';

/** Composite-index snapshot in the backup folder (same shape as infra/firestore). */
export const INDEXES_FILE = 'firestore.indexes.json';

export interface Manifest {
  /** Environment the backup was taken from ('dev01' | 'dev02' | 'prod'). */
  source: Env;
  projectId: string;
  createdAt: string;
  /** Document count per backed-up collection. */
  collections: Record<string, number>;
}

/** The environment is baked into each npm script as the first CLI argument. */
export function requireEnvArg(): Env {
  const env = process.argv[2];
  if (!(ENVS as readonly string[]).includes(env)) {
    throw new Error(
      `Expected one of ${ENVS.join(', ')} as the first argument (got ${JSON.stringify(env)}). ` +
        'Run this via the npm scripts (backup:<env>, import:<env>).',
    );
  }
  return env as Env;
}

/**
 * The exact command to re-run the current npm script with --apply, for the
 * dry-run hint. Spelled out because `npm run <script> --apply` (without the
 * separating `--`) silently drops the flag — npm 11 even expands it into its
 * own single-letter configs — so the script just dry-runs again.
 */
export function applyCommand(): string {
  const script = process.env.npm_lifecycle_event ?? '<script>';
  const args = process.argv.slice(3).filter((a) => a !== '--apply');
  return ['npm run', script, '--', ...args, '--apply'].join(' ');
}

export function loadCredential(): LoadedCredential {
  const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (credentialPath) {
    const json = JSON.parse(fs.readFileSync(path.resolve(credentialPath), 'utf8'));
    return { credential: cert(json), projectId: json.project_id };
  }
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialJson) {
    const json = JSON.parse(Buffer.from(credentialJson, 'base64').toString('utf8'));
    return { credential: cert(json), projectId: json.project_id };
  }
  throw new Error(
    'No credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON ' +
      'in the tools/firestore/.env.<env> file for this environment (see .env.example).',
  );
}

/**
 * Materialize the service-account credentials as a file path suitable for
 * GOOGLE_APPLICATION_CREDENTIALS (firebase-tools can't take base64 env JSON).
 */
function credentialFile(): { path: string; cleanup: () => void } {
  const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (credentialPath) {
    return { path: path.resolve(credentialPath), cleanup: () => {} };
  }
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialJson) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantry-backup-cred-'));
    const file = path.join(dir, 'service-account.json');
    fs.writeFileSync(file, Buffer.from(credentialJson, 'base64'));
    return { path: file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }
  throw new Error(
    'No credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON ' +
      'in the tools/firestore/.env.<env> file for this environment (see .env.example).',
  );
}

/**
 * Run a firebase-tools command against the given project, authenticated via
 * GOOGLE_APPLICATION_CREDENTIALS — the same pattern as the CI index-deploy
 * workflow (.github/workflows/firestore-indexes.yml), no `firebase login`
 * needed. Uses `npx --yes`, so the first run downloads firebase-tools.
 */
export function runFirebaseTools(args: string[], opts: { projectId: string; cwd?: string }): string {
  const parts = ['npx', '--yes', 'firebase-tools', ...args, '--project', opts.projectId, '--non-interactive'];
  // npx is a .cmd shim on Windows, so the command must run through a shell.
  // Passing an args array with shell:true is deprecated (DEP0190: args are
  // concatenated unescaped), so build the command string ourselves and reject
  // anything outside a safe token whitelist instead of trying to escape.
  for (const part of parts) {
    if (!/^[\w.:/=-]+$/.test(part)) {
      throw new Error(`Refusing to shell out with unsafe argument: ${JSON.stringify(part)}`);
    }
  }
  const cred = credentialFile();
  try {
    const res = spawnSync(parts.join(' '), {
      cwd: opts.cwd,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: cred.path },
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      throw new Error(
        `firebase-tools ${args.join(' ')} failed (exit ${res.status}):\n${res.stderr || res.stdout}`,
      );
    }
    return res.stdout;
  } finally {
    cred.cleanup();
  }
}

/** Recursively replace Firestore value types with JSON-safe tagged objects. */
export function serializeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Timestamp) {
    return { __fs: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { __fs: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) {
    return { __fs: 'ref', path: value.path };
  }
  // Bytes fields; none exist in the current schemas, handled defensively.
  if (value instanceof Uint8Array) {
    return { __fs: 'bytes', base64: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
  return out;
}

/** Inverse of serializeValue. Needs the target Firestore for DocumentReferences. */
export function deserializeValue(value: unknown, db: Firestore): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => deserializeValue(v, db));
  const obj = value as Record<string, unknown>;
  switch (obj.__fs) {
    case 'timestamp':
      return new Timestamp(obj.seconds as number, obj.nanoseconds as number);
    case 'geopoint':
      return new GeoPoint(obj.latitude as number, obj.longitude as number);
    case 'ref':
      return db.doc(obj.path as string);
    case 'bytes':
      return Buffer.from(obj.base64 as string, 'base64');
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = deserializeValue(v, db);
  return out;
}
