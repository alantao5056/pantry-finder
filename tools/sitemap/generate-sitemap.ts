/**
 * Standalone sitemap generator for PantryFinder.
 *
 * Connects directly to (prod) Firestore, reads every pantry, and writes an XML
 * sitemap covering the static routes plus one canonical URL per pantry. Run it
 * locally and scp the output onto the server's web `.output/public/sitemap.xml`
 * (the deploy pipeline preserves it — see .github/workflows/deploy.yml).
 *
 *   npm run sitemap -- <path-to-service-account.json>
 *   npx tsx tools/sitemap/generate-sitemap.ts <path-to-service-account.json>
 *
 * Credentials & config come from tools/sitemap/.env (see .env.example) or env:
 *   FIREBASE_SERVICE_ACCOUNT_PATH  path to a service-account JSON, or
 *   FIREBASE_SERVICE_ACCOUNT_JSON  base64-encoded service-account JSON
 *   SITE_URL                       origin for the URLs (default https://pantryfinder.org)
 *   SITEMAP_OUT                    output path (default tools/sitemap/sitemap.xml)
 * A service-account JSON path may also be passed as the first CLI argument.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import { pantrySlugId } from '@pantry-finder/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

const SITE_URL = (process.env.SITE_URL || 'https://pantryfinder.org').replace(/\/+$/, '');
const OUT_PATH = process.env.SITEMAP_OUT
  ? path.resolve(process.env.SITEMAP_OUT)
  : path.join(here, 'sitemap.xml');

// Static, indexable routes. Dev-only routes (e.g. /test-geo) are intentionally
// omitted; auth is modal-based so there are no standalone auth pages to list.
const STATIC_PATHS = ['/', '/search'];

// Google's sitemap limit is 50,000 URLs per file. With ~1,400 pantries we are far
// under it, so a single file is correct. If the dataset ever approaches this
// (e.g. after adding city landing pages), split into a sitemap index.
const SITEMAP_URL_LIMIT = 50_000;

function loadCredential(): admin.credential.Credential {
  const argPath = process.argv[2];
  const credentialPath = argPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (credentialPath) {
    return admin.credential.cert(path.resolve(credentialPath));
  }
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialJson) {
    const jsonStr = Buffer.from(credentialJson, 'base64').toString('utf8');
    return admin.credential.cert(JSON.parse(jsonStr));
  }
  throw new Error(
    'No credentials. Pass a service-account JSON path as the first argument, or set ' +
      'FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_SERVICE_ACCOUNT_JSON in tools/sitemap/.env.',
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface UrlEntry {
  loc: string;
  lastmod?: string;
}

function toLastmod(updatedAt: unknown): string | undefined {
  // Firestore Timestamps expose toDate(); guard against missing/legacy values.
  if (updatedAt && typeof (updatedAt as admin.firestore.Timestamp).toDate === 'function') {
    return (updatedAt as admin.firestore.Timestamp).toDate().toISOString();
  }
  return undefined;
}

function renderSitemap(entries: UrlEntry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n` +
    '</urlset>\n'
  );
}

async function main(): Promise<void> {
  admin.initializeApp({ credential: loadCredential() });
  const db = admin.firestore();

  const snapshot = await db.collection('pantries').select('name', 'updatedAt').get();

  const entries: UrlEntry[] = STATIC_PATHS.map((p) => ({ loc: `${SITE_URL}${p}` }));

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = typeof data.name === 'string' ? data.name : '';
    entries.push({
      loc: `${SITE_URL}/pantries/${pantrySlugId({ name, id: doc.id })}`,
      lastmod: toLastmod(data.updatedAt),
    });
  }

  if (entries.length > SITEMAP_URL_LIMIT) {
    console.warn(
      `WARNING: ${entries.length} URLs exceeds the ${SITEMAP_URL_LIMIT}-per-file sitemap limit. ` +
        'Split into a sitemap index.',
    );
  }

  fs.writeFileSync(OUT_PATH, renderSitemap(entries), 'utf8');
  console.log(
    `Wrote ${entries.length} URLs (${snapshot.size} pantries + ${STATIC_PATHS.length} static) to ${OUT_PATH}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate sitemap:', err);
  process.exit(1);
});
