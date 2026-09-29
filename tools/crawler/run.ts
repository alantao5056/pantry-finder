/**
 * One crawl run — pick the least recently crawled pantries, crawl them, keep
 * the `crawl_runs` doc up to date. Shared by the CLI (crawl.ts) and the worker
 * (worker.ts), which differ only in where the run doc comes from and how a
 * stop is requested.
 */
import PQueue from 'p-queue';
import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type { CrawlRunOptions, CrawlRunStatus } from '@pantry-finder/shared';
import { CRAWL_HEARTBEAT_MS, type CrawlRunDocument } from '@pantry-finder/shared/firestore';
import type { Extractor } from './extract/Extractor.js';
import type { Fetcher } from './fetch/fetcher.js';
import type { Logger } from './logger.js';
import { PantryCrawler, emptyStats } from './pipeline.js';
import { selectPantries } from './select.js';
import { SiteCache } from './site-cache.js';

const SAVE_EVERY = 10;

export interface CrawlJobConfig {
  db: Firestore;
  /** The run's `crawl_runs` doc; null for CLI dry runs, which record nothing. */
  runRef: DocumentReference | null;
  apply: boolean;
  options: CrawlRunOptions & { limit: number };
  concurrency: number;
  fetcher: Fetcher;
  extractor: Extractor;
  logger: Logger;
}

export class CrawlJob {
  readonly stats = emptyStats();
  private stopping = false;
  private finished = false;
  private siteCache: SiteCache | null = null;

  constructor(private readonly config: CrawlJobConfig) {}

  /** Graceful stop: pantries in progress finish, the rest are left for the next run. */
  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.config.logger.warn('Stopping: finishing the pantries in progress…');
  }

  /** Immediate stop before the process exits: records the run as aborted as it stands. */
  async abortNow(): Promise<void> {
    this.stopping = true;
    this.finished = true;
    await this.saveProgress('aborted');
    await this.siteCache?.close();
  }

  async run(): Promise<CrawlRunStatus> {
    const { db, runRef, apply, options, concurrency, fetcher, extractor, logger } = this.config;
    const heartbeat = runRef ? setInterval(() => void this.beat(), CRAWL_HEARTBEAT_MS) : null;
    try {
      const todo = (await selectPantries(db, options.pantryId)).slice(0, options.limit);
      logger.info(`${todo.length} pantr${todo.length === 1 ? 'y' : 'ies'} to crawl (concurrency ${concurrency}).`);

      // Clears the API's cached copies of updated pantries so the site shows changes at once.
      this.siteCache = apply ? SiteCache.fromEnv(logger) : SiteCache.disabled(logger);
      await this.siteCache.check();
      const crawler = new PantryCrawler(db, fetcher, extractor, runRef?.id ?? null, apply, this.stats, this.siteCache, logger);

      let completed = 0;
      const queue = new PQueue({ concurrency });
      for (const p of todo) {
        void queue.add(async () => {
          if (this.stopping) return;
          logger.info(`${p.id} ${p.pantry.name} — ${p.url}`);
          await crawler.process(p.id, p.pantry);
          completed++;
          if (completed % SAVE_EVERY === 0) await this.saveProgress();
        });
      }
      await queue.onIdle();
      await this.siteCache.close();
      if (this.finished) return 'aborted';

      const { stats } = this;
      const status: CrawlRunStatus = this.stopping
        ? 'aborted'
        : stats.errors.length && stats.fetched === 0 && todo.length
          ? 'failed'
          : 'completed';
      await this.saveProgress(status);
      logger.info(`
${status === 'aborted' ? 'Stopped' : 'Done'}. crawled ${completed} of ${todo.length}: fetched ${stats.fetched}, failed ${stats.failed}, auto-updated ${stats.autoUpdated}, review items ${stats.reviewItemsCreated}, unchanged ${stats.skippedUnchanged}
LLM: ${stats.llmCalls} call(s), ${stats.inputTokens} input / ${stats.outputTokens} output tokens
Errors: ${stats.errors.length}`);
      // M2 never changes names/addresses or adds pantries; once M3/M4 do, the
      // browse index needs a rebuild.
      return status;
    } catch (err) {
      this.stats.errors.push(`run: ${(err as Error).message}`);
      if (!this.finished) await this.saveProgress('failed');
      await this.siteCache?.close();
      throw err;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  private async saveProgress(status?: CrawlRunStatus): Promise<void> {
    const { runRef } = this.config;
    if (!runRef) return;
    const { stats } = this;
    const now = Timestamp.now();
    const update: Partial<CrawlRunDocument> = {
      counts: {
        fetched: stats.fetched,
        failed: stats.failed,
        autoUpdated: stats.autoUpdated,
        reviewItemsCreated: stats.reviewItemsCreated,
      },
      errors: stats.errors,
      heartbeatAt: now,
      ...(status ? { status, finishedAt: now } : {}),
    };
    await runRef.update(update);
  }

  private async beat(): Promise<void> {
    try {
      await this.config.runRef?.update({ heartbeatAt: Timestamp.now() });
    } catch (err) {
      this.config.logger.warn(`heartbeat: ${(err as Error).message}`);
    }
  }
}
