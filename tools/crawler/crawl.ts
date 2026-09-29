/**
 * Crawls single-pantry websites (docs/crawler-design.md, M2). Dry run by
 * default: fetches and calls the LLM, prints what it would do, writes nothing.
 *
 *   npm run crawl:dev01 -- [--limit N] [--pantry <id>] [--concurrency N] [--apply]
 *   npm run crawl:dev01 -- --resume <runId> --apply
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

const CHECKPOINT_EVERY = 10;

const env = requireEnvArg();
const apply = hasFlag('apply');
const resumeId = flag('resume');
const concurrency = intFlag('concurrency') ?? 8;
const { db, projectId } = initFirestore();

const extractor = new DeepSeekExtractor(requireEnvVar('DEEPSEEK_API_KEY'), requireEnvVar('DEEPSEEK_MODEL'));
const fetcher = new Fetcher(requireEnvVar('CRAWLER_CONTACT'));

console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: crawl (env ${env}, project ${projectId}, model ${extractor.model})`);
peakHourWarning();

// ---- run bookkeeping ----

let options: CrawlRunDocument['options'] = { limit: intFlag('limit'), pantryId: flag('pantry') };
let checkpoint: string | undefined;
let runRef: FirebaseFirestore.DocumentReference | null = null;

if (resumeId) {
  if (!apply) throw new Error('--resume only makes sense with --apply.');
  runRef = db.collection(COLLECTIONS.crawlRuns).doc(resumeId);
  const run = (await runRef.get()).data() as CrawlRunDocument | undefined;
  if (!run) throw new Error(`No crawl run ${resumeId}.`);
  if (run.env !== env) throw new Error(`Run ${resumeId} was for ${run.env}, not ${env}.`);
  options = run.options ?? {};
  checkpoint = run.checkpoint;
  await runRef.update({ status: 'running', finishedAt: null });
  console.log(`Resuming run ${resumeId} after ${checkpoint ?? '(start)'}`);
} else if (apply) {
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

let todo = await selectPantries(db, options.pantryId);
if (options.limit) todo = todo.slice(0, options.limit);
if (checkpoint) todo = todo.filter((p) => p.id > checkpoint!);

console.log(`${todo.length} pantr${todo.length === 1 ? 'y' : 'ies'} to crawl (concurrency ${concurrency}).`);

// ---- crawl ----

const stats = emptyStats();
// Clears the API's cached copies of updated pantries so the site shows changes at once.
const siteCache = apply ? SiteCache.fromEnv() : SiteCache.disabled();
await siteCache.check();
const crawler = new PantryCrawler(db, fetcher, extractor, runRef?.id ?? null, apply, stats, siteCache);

// Checkpoint = the highest id with every id before it done (tasks finish out of order).
const done = new Set<string>();
let nextIndex = 0;
let completed = 0;
const advanceCheckpoint = () => {
  while (nextIndex < todo.length && done.has(todo[nextIndex].id)) {
    checkpoint = todo[nextIndex].id;
    nextIndex++;
  }
};

// Counts and errors accumulate across resumed sessions.
const initialRun = runRef ? ((await runRef.get()).data() as CrawlRunDocument) : null;
const saveProgress = async (status?: CrawlRunDocument['status']) => {
  if (!runRef || !initialRun) return;
  const base = initialRun.counts;
  await runRef.update({
    counts: {
      fetched: base.fetched + stats.fetched,
      failed: base.failed + stats.failed,
      autoUpdated: base.autoUpdated + stats.autoUpdated,
      reviewItemsCreated: base.reviewItemsCreated + stats.reviewItemsCreated,
    },
    errors: [...(initialRun.errors ?? []), ...stats.errors].slice(-100),
    ...(checkpoint ? { checkpoint } : {}),
    ...(status ? { status, finishedAt: Timestamp.now() } : {}),
  });
};

let aborting = false;
process.on('SIGINT', () => {
  if (aborting) process.exit(130);
  aborting = true;
  console.warn('\nInterrupted: saving checkpoint (Ctrl+C again to force quit)…');
  void saveProgress('aborted').then(async () => {
    await siteCache.close();
    if (runRef) console.warn(`Resume with: npm run ${process.env.npm_lifecycle_event} -- --resume ${runRef.id} --apply`);
    process.exit(130);
  });
});

const queue = new PQueue({ concurrency });
for (const p of todo) {
  void queue.add(async () => {
    if (aborting) return;
    console.log(`${p.id} ${p.pantry.name} — ${p.url}`);
    await crawler.process(p.id, p.pantry);
    done.add(p.id);
    completed++;
    advanceCheckpoint();
    if (completed % CHECKPOINT_EVERY === 0) await saveProgress();
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
