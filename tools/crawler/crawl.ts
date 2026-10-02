/**
 * Crawls single-pantry websites (docs/crawler-design.md, M2). Dry run by
 * default: fetches and calls the LLM, prints what it would do, writes nothing.
 *
 *   npm run crawl:dev01 -- [--limit N] [--pantry <id>] [--llm deepseek|gemini] [--concurrency N] [--apply]
 *
 * Each run takes the `--limit` (default 100) least recently crawled pantries,
 * so repeated runs rotate through all of them; an interrupted run's leftovers
 * are simply picked up by the next one. The same runs can be started from the
 * admin (Crawler page), executed by worker.ts.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_CRAWL_LIMIT } from '@pantry-finder/shared';
import { COLLECTIONS, type CrawlRunDocument } from '@pantry-finder/shared/firestore';
import { Fetcher } from './fetch/fetcher.js';
import { createExtractor } from './extract/factory.js';
import {
  applyCommand,
  flag,
  hasFlag,
  initFirestore,
  intFlag,
  llmFlag,
  peakHourWarning,
  requireEnvArg,
  requireEnvVar,
} from './lib.js';
import { consoleLogger } from './logger.js';
import { CrawlJob } from './run.js';

const env = requireEnvArg();
const apply = hasFlag('apply');
const concurrency = intFlag('concurrency') ?? 8;
const { db, projectId } = initFirestore();

const extractor = createExtractor(llmFlag());
const fetcher = new Fetcher(requireEnvVar('CRAWLER_CONTACT'));

console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: crawl (env ${env}, project ${projectId}, model ${extractor.model})`);
peakHourWarning(extractor.provider);

const options = { limit: intFlag('limit') ?? DEFAULT_CRAWL_LIMIT, pantryId: flag('pantry'), llm: extractor.provider };
let runRef: FirebaseFirestore.DocumentReference | null = null;

if (apply) {
  const now = Timestamp.now();
  const run: CrawlRunDocument = {
    env,
    mode: 'apply',
    model: extractor.model,
    status: 'running',
    startedAt: now,
    heartbeatAt: now,
    counts: { fetched: 0, failed: 0, autoUpdated: 0, reviewItemsCreated: 0 },
    errors: [],
    options: Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
  };
  runRef = await db.collection(COLLECTIONS.crawlRuns).add(run);
  console.log(`Run ${runRef.id}`);
}

const job = new CrawlJob({ db, runRef, apply, options, concurrency, fetcher, extractor, logger: consoleLogger });

let aborting = false;
process.on('SIGINT', () => {
  if (aborting) process.exit(130);
  aborting = true;
  console.warn('\nInterrupted: saving progress (Ctrl+C again to force quit)…');
  void job.abortNow().then(() => process.exit(130));
});

await job.run();
if (!apply) console.log(`\nDry run only. To write these changes:\n  ${applyCommand()}`);
