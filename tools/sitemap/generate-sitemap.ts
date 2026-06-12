/**
 * Standalone sitemap generator for PantryFinder.
 *
 * Connects directly to (prod) Firestore, reads every pantry, and writes an XML
 * sitemap covering the static routes plus one canonical URL per pantry. Run it
 * locally and scp the output onto the server's web `.output/public/sitemap.xml`
 * (the deploy pipeline preserves it — see .github/workflows/deploy.yml).
 *
 * The same single scan also rebuilds the precomputed browse index in Firestore:
 * the `states/{stateSlug}` and `cities/{stateSlug}_{citySlug}` collections that
 * the API's CityService reads instead of scanning all ~14k pantry docs at
 * runtime (free-tier read quota). Stale docs (cities/states that disappeared
 * from the dataset) are deleted. Re-run this tool whenever the pantry dataset
 * is re-imported, or the browse index and sitemap go stale together.
 *
 * As a side effect it also refreshes the landing-page stats (total pantries +
 * distinct cities) in apps/web/app/data/site-stats.json, which the web app reads
 * via app/utils/siteStats.ts. This commits to the repo, so re-run it whenever the
 * pantry dataset changes meaningfully and commit the updated JSON.
 *
 *   npm run generate:dev   (from tools/sitemap; uses .env.dev)
 *   npm run generate:prod  (uses .env.prod)
 *
 * Both rebuild @pantry-finder/shared first so slug logic is never stale.
 * Credentials & config come from those .env files (see .env.example) or env:
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
import { getFirestore, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import {
  pantrySlugId,
  slugify,
  isValidStateSlug,
  type CityIndexDocument,
  type StateIndexDocument,
} from '@pantry-finder/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

const SITE_URL = (process.env.SITE_URL || 'https://pantryfinder.org').replace(/\/+$/, '');
const OUT_PATH = process.env.SITEMAP_OUT
  ? path.resolve(process.env.SITEMAP_OUT)
  : path.join(here, 'sitemap.xml');

// Landing-page stats consumed by the web app. Written in place so the numbers live
// in one source of truth (apps/web/app/data/site-stats.json) instead of index.vue.
const STATS_PATH = path.resolve(here, '../../apps/web/app/data/site-stats.json');

// Static, indexable routes. Dev-only routes (e.g. /test-geo) are intentionally
// omitted; auth is modal-based so there are no standalone auth pages to list.
const STATIC_PATHS = ['/', '/search', '/food-pantries'];

// Google's sitemap limit is 50,000 URLs per file. Pantries + city/state landing
// pages together stay well under it, so a single file is correct. If the dataset
// ever approaches this, split into a sitemap index.
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

// Rebuild the `states`/`cities` browse-index collections from the freshly
// aggregated docs: upsert every current doc, then delete any doc whose ID is no
// longer in the dataset. listDocuments() returns refs without fetching document
// data, so the stale-doc diff doesn't burn document reads.
async function writeBrowseIndex(
  db: Firestore,
  cityDocs: Map<string, CityIndexDocument>,
  stateDocs: Map<string, StateIndexDocument>,
): Promise<number> {
  const citiesCol = db.collection('cities');
  const statesCol = db.collection('states');
  const writer = db.bulkWriter();

  for (const [id, doc] of cityDocs) {
    void writer.set(citiesCol.doc(id), doc);
  }
  for (const [id, doc] of stateDocs) {
    void writer.set(statesCol.doc(id), doc);
  }

  const [cityRefs, stateRefs] = await Promise.all([
    citiesCol.listDocuments(),
    statesCol.listDocuments(),
  ]);
  let staleCount = 0;
  for (const ref of cityRefs) {
    if (!cityDocs.has(ref.id)) {
      void writer.delete(ref);
      staleCount += 1;
    }
  }
  for (const ref of stateRefs) {
    if (!stateDocs.has(ref.id)) {
      void writer.delete(ref);
      staleCount += 1;
    }
  }

  await writer.close();
  return staleCount;
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
  initializeApp({ credential: loadCredential() });
  const db = getFirestore();

  const snapshot = await db
    .collection('pantries')
    .select('name', 'updatedAt', 'city', 'state')
    .get();

  const entries: UrlEntry[] = STATIC_PATHS.map((p) => ({ loc: `${SITE_URL}${p}` }));

  // Distinct cities, keyed by "stateSlug_citySlug" (the `cities` doc ID) so
  // same-named cities in different states (Springfield, MA vs Springfield, IL)
  // are counted separately, while raw-casing variants of one city collapse to a
  // single slug (city names are unique within a state). The slug rules
  // (slugify + 2-letter state) gate dirty data out of both the sitemap and the
  // browse index, so every emitted landing URL resolves on the API. Track how
  // often each raw casing appears so the most common form becomes the display
  // value.
  const updatedAt = new Date().toISOString();
  const cityAgg = new Map<string, { doc: CityIndexDocument; cityCasings: Map<string, number> }>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = typeof data.name === 'string' ? data.name : '';
    const city = typeof data.city === 'string' ? data.city.trim() : '';
    const state = typeof data.state === 'string' ? data.state.trim() : '';
    const citySlug = slugify(city);
    const stateSlug = state.toLowerCase();
    if (citySlug && isValidStateSlug(stateSlug)) {
      const key = `${stateSlug}_${citySlug}`;
      let record = cityAgg.get(key);
      if (!record) {
        record = {
          doc: {
            city,
            state: state.toUpperCase(),
            citySlug,
            stateSlug,
            pantryCount: 0,
            variants: [],
            updatedAt,
          },
          cityCasings: new Map(),
        };
        cityAgg.set(key, record);
      }
      record.doc.pantryCount += 1;
      record.cityCasings.set(city, (record.cityCasings.get(city) ?? 0) + 1);
      if (!record.doc.variants.some((v) => v.city === city && v.state === state)) {
        record.doc.variants.push({ city, state });
      }
    }
    entries.push({
      loc: `${SITE_URL}/pantries/${pantrySlugId({ name, id: doc.id })}`,
      lastmod: toLastmod(data.updatedAt),
    });
  }

  // Finalize display casing and roll cities up into per-state summaries.
  const cityDocs = new Map<string, CityIndexDocument>();
  const stateDocs = new Map<string, StateIndexDocument>();
  for (const [key, { doc, cityCasings }] of cityAgg) {
    doc.city = [...cityCasings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    cityDocs.set(key, doc);

    const stateDoc = stateDocs.get(doc.stateSlug) ?? {
      state: doc.state,
      stateSlug: doc.stateSlug,
      cityCount: 0,
      pantryCount: 0,
      updatedAt,
    };
    stateDoc.cityCount += 1;
    stateDoc.pantryCount += doc.pantryCount;
    stateDocs.set(doc.stateSlug, stateDoc);
  }

  // City landing pages (/{state}/{city}) plus one state page (/{state}) per
  // distinct state.
  for (const { stateSlug, citySlug } of cityDocs.values()) {
    entries.push({ loc: `${SITE_URL}/food-pantries/${stateSlug}/${citySlug}` });
  }
  for (const stateSlug of [...stateDocs.keys()].sort()) {
    entries.push({ loc: `${SITE_URL}/food-pantries/${stateSlug}` });
  }

  if (entries.length > SITEMAP_URL_LIMIT) {
    console.warn(
      `WARNING: ${entries.length} URLs exceeds the ${SITEMAP_URL_LIMIT}-per-file sitemap limit. ` +
        'Split into a sitemap index.',
    );
  }

  fs.writeFileSync(OUT_PATH, renderSitemap(entries), 'utf8');
  console.log(
    `Wrote ${entries.length} URLs (${snapshot.size} pantries + ${cityDocs.size} cities + ` +
      `${stateDocs.size} states + ${STATIC_PATHS.length} static) to ${OUT_PATH}`,
  );

  const staleCount = await writeBrowseIndex(db, cityDocs, stateDocs);
  console.log(
    `Rebuilt browse index (${cityDocs.size} cities, ${stateDocs.size} states, ` +
      `${staleCount} stale docs deleted) in Firestore`,
  );

  updateSiteStats(snapshot.size, cityDocs.size);
  console.log(
    `Updated site stats (${snapshot.size} pantries, ${cityDocs.size} cities) in ${STATS_PATH}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate sitemap:', err);
  process.exit(1);
});
