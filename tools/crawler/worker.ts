/**
 * Crawler worker: executes the crawl runs queued from the admin (Crawler page
 * → Start crawl). Long-running; one run at a time.
 *
 *   prod:  systemd unit `pantry-finder-crawler`, `node dist/worker.js` with
 *          tools/crawler/.env.production (CRAWLER_ENV=prod)
 *   local: npm run worker:dev01
 *
 * The admin API only writes a `crawl_runs` doc with status `queued`; this
 * process listens for those, claims one (→ `running`), crawls, and streams its
 * log into `crawl_runs/{id}/log` for the admin to show. Stop in the admin sets
 * `abortRequested`, which is honoured after the pantries in progress finish.
 *
 * It also runs the one-pantry LLM comparisons queued from the admin's LLM eval
 * page (`llm_compares`, compare.ts).
 */
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import {
  DEFAULT_CRAWL_LIMIT,
  DEFAULT_LLM_PROVIDER,
  type CrawlRunStatus,
  type LlmCompareStatus,
  llmSettingsLabel,
  type LlmProvider,
  type LlmSettings,
} from '@pantry-finder/shared';
import {
  COLLECTIONS,
  CRAWL_RUN_LOG,
  CRAWL_STALE_MS,
  type CrawlRunDocument,
  type CrawlRunLogDocument,
} from '@pantry-finder/shared/firestore';
import { runCompare } from './compare.js';
import type { Extractor } from './extract/Extractor.js';
import { configuredProviders, createExtractor } from './extract/factory.js';
import { Fetcher, errorMessage } from './fetch/fetcher.js';
import { ENVS, initFirestore, peakHourWarning, requireEnvVar, type Env } from './lib.js';
import type { Logger } from './logger.js';
import { CrawlJob } from './run.js';

const FLUSH_MS = 5000;
const FLUSH_LINES = 200;
const MAX_LOG_LINES = 5000;

const env = (process.env.CRAWLER_ENV ?? process.argv[2]) as Env;
if (!(ENVS as readonly string[]).includes(env)) {
  throw new Error(`Set CRAWLER_ENV to one of ${ENVS.join(', ')} (got ${JSON.stringify(env)}).`);
}
const concurrency = Number(process.env.CRAWLER_CONCURRENCY) || 8;
const { db, projectId } = initFirestore();
const fetcher = new Fetcher(requireEnvVar('CRAWLER_CONTACT'));
const runs = db.collection(COLLECTIONS.crawlRuns);
const compares = db.collection(COLLECTIONS.llmCompares);

// Built on first use, so a provider without an API key only fails the runs that ask for it.
// One per provider and settings (the settings were validated by the API).
const extractors = new Map<string, Extractor>();
function extractorFor(provider: LlmProvider, settings: LlmSettings = {}): Extractor {
  const key = `${provider}:${JSON.stringify(settings)}`;
  let extractor = extractors.get(key);
  if (!extractor) {
    extractor = createExtractor(provider, settings);
    extractors.set(key, extractor);
  }
  return extractor;
}

/** Console plus the run's `log` subcollection, written in chunks. */
class RunLog implements Logger {
  private buffer: string[] = [];
  private seq = 0;
  private written = 0;
  private truncated = false;
  private writing: Promise<void> = Promise.resolve();
  private readonly timer = setInterval(() => void this.flush(), FLUSH_MS);

  constructor(private readonly runRef: DocumentReference) {}

  info(message: string): void {
    console.log(message);
    this.add(message);
  }

  warn(message: string): void {
    console.warn(message);
    this.add(message);
  }

  private add(message: string): void {
    if (this.truncated) return;
    if (this.written + this.buffer.length >= MAX_LOG_LINES) {
      this.truncated = true;
      this.buffer.push(`… log truncated at ${MAX_LOG_LINES} lines (the full log is in the worker's journal)`);
    } else {
      this.buffer.push(...message.split('\n'));
    }
    if (this.buffer.length >= FLUSH_LINES) void this.flush();
  }

  /** Chunks are written one after another so `seq` order matches line order. */
  flush(): Promise<void> {
    if (this.buffer.length === 0) return this.writing;
    const lines = this.buffer;
    this.buffer = [];
    this.written += lines.length;
    const seq = ++this.seq;
    this.writing = this.writing.then(async () => {
      const doc: CrawlRunLogDocument = { seq, lines, createdAt: Timestamp.now() };
      try {
        await this.runRef.collection(CRAWL_RUN_LOG).doc(String(seq).padStart(6, '0')).set(doc);
      } catch (err) {
        console.warn(`log write failed: ${(err as Error).message}`);
      }
    });
    return this.writing;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}

let current: { job: CrawlJob; log: RunLog } | null = null;
let busy = false;
let shuttingDown = false;

/** Runs left `running` by a worker (or CLI) that died without saying so. */
async function failStaleRuns(): Promise<void> {
  const cutoff = Date.now() - CRAWL_STALE_MS;
  const snap = await runs.where('status', '==', 'running').get();
  for (const doc of snap.docs) {
    const run = doc.data() as CrawlRunDocument;
    const lastSeen = (run.heartbeatAt ?? run.startedAt).toMillis();
    if (lastSeen >= cutoff) continue;
    console.warn(`Run ${doc.id}: no heartbeat since ${new Date(lastSeen).toISOString()}; marking failed.`);
    await doc.ref.update({
      status: 'failed' satisfies CrawlRunStatus,
      finishedAt: Timestamp.now(),
      errors: [...(run.errors ?? []), 'The crawler stopped mid-run (no heartbeat).'],
    });
  }
}

/** Moves a queued run to `running`; false if it was stopped or claimed meanwhile. */
async function claim(ref: DocumentReference, model: string): Promise<CrawlRunDocument | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const run = snap.data() as CrawlRunDocument | undefined;
    if (!run || run.status !== 'queued' || run.abortRequested) return null;
    const now = Timestamp.now();
    const update: Partial<CrawlRunDocument> = { status: 'running', env, model, startedAt: now, heartbeatAt: now };
    tx.update(ref, update);
    return { ...run, ...update };
  });
}

/** Fails a queued run that can't be started (its LLM isn't configured). */
async function reject(ref: DocumentReference, message: string): Promise<void> {
  console.warn(`Run ${ref.id}: ${message}`);
  await db.runTransaction(async (tx) => {
    const run = (await tx.get(ref)).data() as CrawlRunDocument | undefined;
    if (!run || run.status !== 'queued') return;
    const update: Partial<CrawlRunDocument> = {
      status: 'failed',
      env,
      finishedAt: Timestamp.now(),
      errors: [...(run.errors ?? []), message],
    };
    tx.update(ref, update);
  });
}

async function execute(ref: DocumentReference, run: CrawlRunDocument, extractor: Extractor): Promise<void> {
  const apply = run.mode === 'apply';
  const log = new RunLog(ref);
  const job = new CrawlJob({
    db,
    runRef: ref,
    apply,
    options: { ...run.options, limit: run.options?.limit ?? DEFAULT_CRAWL_LIMIT },
    concurrency,
    fetcher,
    extractor,
    logger: log,
  });
  current = { job, log };
  const stopWatch = ref.onSnapshot(
    (snap) => {
      if ((snap.data() as CrawlRunDocument | undefined)?.abortRequested) job.stop();
    },
    (err) => console.warn(`Run ${ref.id}: stop listener failed: ${err.message}`),
  );

  log.info(
    `Run ${ref.id} by ${run.requestedBy ?? 'unknown'}: ${apply ? 'APPLYING' : 'DRY RUN (nothing is written)'} ` +
      `(env ${env}, project ${projectId}, model ${extractor.model}, ` +
      `${llmSettingsLabel(extractor.provider, extractor.settings)})`,
  );
  peakHourWarning(extractor.provider, log);
  try {
    await job.run();
  } catch (err) {
    log.warn(`Run failed: ${(err as Error).stack ?? err}`);
  } finally {
    stopWatch();
    await log.close();
    current = null;
  }
}

/** Takes queued runs one at a time until none is left. */
async function drain(): Promise<void> {
  if (busy || shuttingDown) return;
  busy = true;
  try {
    for (;;) {
      const snap = await runs.where('status', '==', 'queued').get();
      const next = snap.docs.sort((a, b) => a.get('startedAt').toMillis() - b.get('startedAt').toMillis())[0];
      if (!next || shuttingDown) return;
      const options = (next.data() as CrawlRunDocument).options;
      let extractor: Extractor;
      try {
        extractor = extractorFor(options?.llm ?? DEFAULT_LLM_PROVIDER, options?.settings);
      } catch (err) {
        await reject(next.ref, errorMessage(err));
        continue;
      }
      const run = await claim(next.ref, extractor.model);
      if (run) await execute(next.ref, run, extractor);
    }
  } catch (err) {
    console.error(`Worker: ${(err as Error).stack ?? err}`);
  } finally {
    busy = false;
  }
}

// ---- LLM comparisons (compare.ts) ----
// One site and two LLM calls each, so they run alongside a crawl instead of
// waiting for it; one at a time among themselves.

let comparing = false;

/** Comparisons left `running` by a worker that died; this one is the only worker. */
async function failStaleCompares(): Promise<void> {
  const snap = await compares.where('status', '==', 'running').get();
  for (const doc of snap.docs) {
    await doc.ref.update({
      status: 'failed' satisfies LlmCompareStatus,
      finishedAt: Timestamp.now(),
      error: 'The crawler worker stopped mid-comparison.',
    });
  }
}

async function drainCompares(): Promise<void> {
  if (comparing || shuttingDown) return;
  comparing = true;
  try {
    for (;;) {
      const snap = await compares.where('status', '==', 'queued').get();
      const next = snap.docs.sort((a, b) => a.get('createdAt').toMillis() - b.get('createdAt').toMillis())[0];
      if (!next || shuttingDown) return;
      await runCompare({ db, fetcher, env, extractorFor }, next.ref);
    }
  } catch (err) {
    console.error(`Worker (compare): ${(err as Error).stack ?? err}`);
  } finally {
    comparing = false;
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  console.warn(`${signal}: shutting down${current ? ', marking the current run aborted' : ''}…`);
  if (current) {
    current.log.warn(`Crawler worker stopped (${signal}); run aborted. The next run picks up where it left off.`);
    await current.job.abortNow();
    await current.log.close();
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log(
  `Crawler worker (env ${env}, project ${projectId}, LLMs configured: ${configuredProviders().join(', ') || 'none'}, concurrency ${concurrency})`,
);
await failStaleRuns();
await failStaleCompares();
// Fatal for a listener; exit so systemd restarts the worker.
const listenerFailed = (err: Error): never => {
  console.error(`Queue listener failed: ${err.message}`);
  process.exit(1);
};
runs.where('status', '==', 'queued').onSnapshot((snap) => {
  if (!snap.empty) void drain();
}, listenerFailed);
compares.where('status', '==', 'queued').onSnapshot((snap) => {
  if (!snap.empty) void drainCompares();
}, listenerFailed);
console.log('Waiting for runs queued from the admin…');
