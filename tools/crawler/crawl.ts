/**
 * Crawls single-pantry websites (docs/crawler-design.md, M2). Dry run by
 * default: fetches and calls the LLM, prints what it would do, writes nothing.
 *
 *   npm run crawl:dev01 -- [--limit N] [--pantry <id>] [--concurrency N] [--apply]
 *
 * Each run takes the `--limit` (default 100) least recently crawled pantries,
 * so repeated runs rotate through all of them; an interrupted run's leftovers
 * are simply picked up by the next one.
 */
import PQueue from 'p-queue';
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, type CrawlRunDocument } from '@pantry-finder/shared/firestore';
import { Fetcher } from './fetch/fetcher.js';
import { DeepSeekExtractor } from './extract/DeepSeekExtractor.js';
import {
  applyCommand,
  flag,
  hasFlag,
  initFirestore,
  intFlag,
  peakHourWarning,
  requireEnvArg,
  requireEnvVar,
} from './lib.js';
import { PantryCrawler, emptyStats } from './pipeline.js';
import { selectPantries } from './select.js';
import { SiteCache } from './site-cache.js';

const DEFAULT_LIMIT = 100;
const SAVE_EVERY = 10;

const env = requireEnvArg();
const apply = hasFlag('apply');
const concurrency = intFlag('concurrency') ?? 8;
const { db, projectId } = initFirestore();

const extractor = new DeepSeekExtractor(requireEnvVar('DEEPSEEK_API_KEY'), requireEnvVar('DEEPSEEK_MODEL'));
const fetcher = new Fetcher(requireEnvVar('CRAWLER_CONTACT'));

console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: crawl (env ${env}, project ${projectId}, model ${extractor.model})`);
peakHourWarning();

// ---- run bookkeeping ----

const options: CrawlRunDocument['options'] = { limit: intFlag('limit') ?? DEFAULT_LIMIT, pantryId: flag('pantry') };
let runRef: FirebaseFirestore.DocumentReference | null = null;

if (apply) {
  const run: CrawlRunDocument = {
    env,
    mode: 'apply',
    status: 'running',
    startedAt: Timestamp.now(),
    counts: { fetched: 0, failed: 0, autoUpdated: 0, reviewItemsCreated: 0 },
    errors: [],
    options: Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
  };
  runRef = await db.collection(COLLECTIONS.crawlRuns).add(run);
  console.log(`Run ${runRef.id}`);
}

// ---- pick pantries ----

const todo = (await selectPantries(db, options.pantryId)).slice(0, options.limit);

console.log(`${todo.length} pantr${todo.length === 1 ? 'y' : 'ies'} to crawl (concurrency ${concurrency}).`);

// ---- crawl ----

const stats = emptyStats();
// Clears the API's cached copies of updated pantries so the site shows changes at once.
const siteCache = apply ? SiteCache.fromEnv() : SiteCache.disabled();
await siteCache.check();
const crawler = new PantryCrawler(db, fetcher, extractor, runRef?.id ?? null, apply, stats, siteCache);

let completed = 0;
const saveProgress = async (status?: CrawlRunDocument['status']) => {
  if (!runRef) return;
  await runRef.update({
    counts: {
      fetched: stats.fetched,
      failed: stats.failed,
      autoUpdated: stats.autoUpdated,
      reviewItemsCreated: stats.reviewItemsCreated,
    },
    errors: stats.errors,
    ...(status ? { status, finishedAt: Timestamp.now() } : {}),
  });
};

let aborting = false;
process.on('SIGINT', () => {
  if (aborting) process.exit(130);
  aborting = true;
  console.warn('\nInterrupted: saving progress (Ctrl+C again to force quit)…');
  void saveProgress('aborted').then(async () => {
    await siteCache.close();
    process.exit(130);
  });
});

const queue = new PQueue({ concurrency });
for (const p of todo) {
  void queue.add(async () => {
    if (aborting) return;
    console.log(`${p.id} ${p.pantry.name} — ${p.url}`);
    await crawler.process(p.id, p.pantry);
    completed++;
    if (completed % SAVE_EVERY === 0) await saveProgress();
  });
}
await queue.onIdle();
await siteCache.close();

if (!aborting) {
  await saveProgress(stats.errors.length && stats.fetched === 0 && todo.length ? 'failed' : 'completed');

  console.log(`
Done. fetched ${stats.fetched}, failed ${stats.failed}, auto-updated ${stats.autoUpdated}, review items ${stats.reviewItemsCreated}, unchanged ${stats.skippedUnchanged}
LLM: ${stats.llmCalls} call(s), ${stats.inputTokens} input / ${stats.outputTokens} output tokens
Errors: ${stats.errors.length}`);
  // M2 never changes names/addresses or adds pantries; once M3/M4 do, the
  // browse index needs a rebuild.
  if (!apply) console.log(`\nDry run only. To write these changes:\n  ${applyCommand()}`);
}
