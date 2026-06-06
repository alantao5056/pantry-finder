/**
 * Standalone sitemap generator for PantryFinder.
 *
 * Connects directly to (prod) Firestore, reads every pantry, and writes an XML
 * sitemap. The static routes are NOT generated here — they live in the committed
 * apps/web/public/sitemap.xml (which Nuxt serves by default). This tool COPIES that
 * file as its base and appends one canonical <url> per pantry before the closing
 * </urlset>. Run it locally and scp the output onto the server's web
 * `.output/public/sitemap.xml`; the deploy pipeline intentionally does NOT ship a
 * sitemap.xml, so the manually-uploaded one survives — see .github/workflows/deploy.yml.
 *
 * As a side effect it also refreshes the landing-page stats (total pantries +
 * distinct cities) in apps/web/app/data/site-stats.json, which the web app reads
 * via app/utils/siteStats.ts. This commits to the repo, so re-run it whenever the
 * pantry dataset changes meaningfully and commit the updated JSON.
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
import { initializeApp, cert, type Credential } from 'firebase-admin/app';
import { getFirestore, type Timestamp } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import { pantrySlugId } from '@pantry-finder/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

const SITE_URL = (process.env.SITE_URL || 'https://pantryfinder.org').replace(/\/+$/, '');
const OUT_PATH = process.env.SITEMAP_OUT
  ? path.resolve(process.env.SITEMAP_OUT)
  : path.join(here, 'sitemap.xml');

// Landing-page stats consumed by the web app. Written in place so the numbers live
// in one source of truth (apps/web/app/data/site-stats.json) instead of index.vue.
const STATS_PATH = path.resolve(here, '../../apps/web/app/data/site-stats.json');

// Committed base sitemap that Nuxt bakes into the build and serves by default. It holds
// the static, indexable routes (/, /search) — the single source of truth for them. This
// tool copies it verbatim and appends the per-pantry URLs, so the static routes are never
// duplicated here.
const PUBLIC_SITEMAP_PATH = path.resolve(here, '../../apps/web/public/sitemap.xml');

// Google's sitemap limit is 50,000 URLs per file. With ~1,400 pantries we are far
// under it, so a single file is correct. If the dataset ever approaches this
// (e.g. after adding city landing pages), split into a sitemap index.
const SITEMAP_URL_LIMIT = 50_000;

function loadCredential(): Credential {
  const argPath = process.argv[2];
  const credentialPath = argPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (credentialPath) {
    return cert(path.resolve(credentialPath));
  }
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialJson) {
    const jsonStr = Buffer.from(credentialJson, 'base64').toString('utf8');
    const json = JSON.parse(jsonStr);
    return cert(json);
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
  if (updatedAt && typeof (updatedAt as Timestamp).toDate === 'function') {
    return (updatedAt as Timestamp).toDate().toISOString();
  }
  return undefined;
}

// Round down to a clean threshold so the stored numbers read as round figures and stay
// truthful (we never claim more than we have). The web app appends a "+" when displaying.
function roundDown(n: number, step: number): number {
  return Math.floor(n / step) * step;
}

// Refresh the two landing-page numbers in apps/web/app/data/site-stats.json.
// We rewrite the JSON (parse → mutate → stringify) rather than editing index.vue, but
// we still guard the target: if the file is gone or its shape changed, fail loudly so
// the script can't silently stop updating the numbers the site depends on.
function updateSiteStats(pantryCount: number, cityCount: number): void {
  if (!fs.existsSync(STATS_PATH)) {
    throw new Error(
      `Site stats file not found at ${STATS_PATH}. The web app expects it ` +
        '(apps/web/app/data/site-stats.json) — did it move or get deleted?',
    );
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`Could not parse ${STATS_PATH} as JSON: ${(err as Error).message}`);
  }
  if (typeof json.pantryCount !== 'number' || typeof json.cityCount !== 'number') {
    throw new Error(
      `${STATS_PATH} is missing the expected numeric "pantryCount"/"cityCount" keys — ` +
        'its shape may have changed. Update generate-sitemap.ts to match.',
    );
  }
  json.pantryCount = roundDown(pantryCount, 100);
  json.cityCount = roundDown(cityCount, 10);
  json.generatedAt = new Date().toISOString();
  fs.writeFileSync(STATS_PATH, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

function renderUrlEntries(entries: UrlEntry[]): string {
  return entries
    .map((e) => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
}

// Copy the committed public sitemap (which carries the static routes) and splice the
// pantry <url> blocks in just before the closing </urlset>. We guard the base file the
// same way updateSiteStats guards the stats file: fail loudly rather than silently emit a
// sitemap missing its static routes or its closing tag.
function appendPantryUrls(entries: UrlEntry[]): string {
  if (!fs.existsSync(PUBLIC_SITEMAP_PATH)) {
    throw new Error(
      `Base sitemap not found at ${PUBLIC_SITEMAP_PATH}. The web app commits it ` +
        '(apps/web/public/sitemap.xml) as the served default — did it move or get deleted?',
    );
  }
  const base = fs.readFileSync(PUBLIC_SITEMAP_PATH, 'utf8');
  const closing = '</urlset>';
  const idx = base.lastIndexOf(closing);
  if (idx === -1) {
    throw new Error(
      `Base sitemap at ${PUBLIC_SITEMAP_PATH} has no closing </urlset> tag — ` +
        'cannot append pantry URLs. Is it valid XML?',
    );
  }
  // Trim trailing whitespace from the copied head (the committed file has no trailing
  // newline) so the spliced result stays consistently formatted.
  const head = base.slice(0, idx).replace(/\s*$/, '\n');
  return `${head}${renderUrlEntries(entries)}\n${closing}\n`;
}

async function main(): Promise<void> {
  initializeApp({ credential: loadCredential() });
  const db = getFirestore();

  const snapshot = await db
    .collection('pantries')
    .select('name', 'updatedAt', 'city', 'state')
    .get();

  // Only pantry URLs are generated here; the static routes come from the copied base
  // sitemap (PUBLIC_SITEMAP_PATH) in appendPantryUrls below.
  const entries: UrlEntry[] = [];

  // Distinct cities, keyed by "city|state" so same-named cities in different states
  // (Springfield, MA vs Springfield, IL) are counted separately, while a single city's
  // many ZIP codes still collapse to one (city names are unique within a state).
  const cities = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = typeof data.name === 'string' ? data.name : '';
    const city = typeof data.city === 'string' ? data.city.trim() : '';
    const state = typeof data.state === 'string' ? data.state.trim() : '';
    if (city) cities.add(`${city.toLowerCase()}|${state.toLowerCase()}`);
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

  fs.writeFileSync(OUT_PATH, appendPantryUrls(entries), 'utf8');
  console.log(
    `Wrote ${snapshot.size} pantry URLs appended to the static routes from ` +
      `${PUBLIC_SITEMAP_PATH} → ${OUT_PATH}`,
  );

  updateSiteStats(snapshot.size, cities.size);
  console.log(
    `Updated site stats (${snapshot.size} pantries, ${cities.size} cities) in ${STATS_PATH}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate sitemap:', err);
  process.exit(1);
});
