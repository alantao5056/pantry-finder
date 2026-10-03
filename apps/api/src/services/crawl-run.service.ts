import { Timestamp } from 'firebase-admin/firestore';
import {
  ACTIVE_CRAWL_RUN_STATUSES,
  type CrawlRunLogResponse,
  type CrawlRunMode,
  type CrawlRunOptions,
  type CrawlRunSummary,
} from '@pantry-finder/shared';
import { COLLECTIONS, CRAWL_RUN_LOG, CRAWL_STALE_MS, type CrawlRunLogDocument } from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';
import { CrawlRunDocument } from '../models/crawl-run.schema';

export const LIST_LIMIT = 50;

export type CrawlRunErrorCode = 'not_found' | 'active_run' | 'not_active';

export class CrawlRunError extends Error {
  constructor(public readonly code: CrawlRunErrorCode) {
    super(code);
  }
}

/** A running run whose crawler stopped refreshing its heartbeat (it died). */
function isStale(run: CrawlRunDocument, now = Date.now()): boolean {
  if (run.status !== 'running') return false;
  return now - (run.heartbeatAt ?? run.startedAt).toMillis() > CRAWL_STALE_MS;
}

function toSummary(id: string, run: CrawlRunDocument): CrawlRunSummary {
  return {
    id,
    env: run.env,
    // Runs are only recorded in apply mode; older docs predate the field.
    mode: run.mode ?? 'apply',
    model: run.model,
    status: run.status,
    startedAt: run.startedAt.toDate().toISOString(),
    finishedAt: run.finishedAt?.toDate().toISOString(),
    counts: run.counts,
    errors: run.errors ?? [],
    options: run.options ?? {},
    requestedBy: run.requestedBy,
    abortRequested: run.abortRequested ?? false,
    stale: isStale(run),
  };
}

/**
 * `crawl_runs`: runs are queued here and executed by the crawler worker
 * (tools/crawler/worker.ts); CLI runs show up here too.
 */
export class CrawlRunService {
  private readonly runsCol = db.collection(COLLECTIONS.crawlRuns);

  /** Most recent runs first. */
  public async listRuns(limit = LIST_LIMIT): Promise<CrawlRunSummary[]> {
    const snapshot = await this.runsCol.orderBy('startedAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => toSummary(doc.id, doc.data() as CrawlRunDocument));
  }

  public async getRun(id: string): Promise<CrawlRunSummary> {
    const snap = await this.runsCol.doc(id).get();
    if (!snap.exists) throw new CrawlRunError('not_found');
    return toSummary(snap.id, snap.data() as CrawlRunDocument);
  }

  /**
   * Queues a run for the worker. Only one run may be queued or running at a
   * time; a stale one (its crawler died) is marked failed instead of blocking.
   */
  public async startRun(mode: CrawlRunMode, options: CrawlRunOptions, requestedBy: string): Promise<CrawlRunSummary> {
    const ref = this.runsCol.doc();
    const run: CrawlRunDocument = {
      env: '',
      mode,
      status: 'queued',
      startedAt: Timestamp.now(),
      counts: { fetched: 0, failed: 0, autoUpdated: 0, reviewItemsCreated: 0 },
      errors: [],
      options,
      requestedBy,
    };
    await db.runTransaction(async (tx) => {
      const active = await tx.get(this.runsCol.where('status', 'in', [...ACTIVE_CRAWL_RUN_STATUSES]));
      for (const doc of active.docs) {
        const other = doc.data() as CrawlRunDocument;
        if (!isStale(other)) throw new CrawlRunError('active_run');
        tx.update(doc.ref, {
          status: 'failed',
          finishedAt: Timestamp.now(),
          errors: [...(other.errors ?? []), 'The crawler stopped mid-run (no heartbeat).'],
        });
      }
      tx.create(ref, run);
    });
    return toSummary(ref.id, run);
  }

  /**
   * A queued run is dropped at once; a running one is asked to stop (the
   * worker finishes the pantries in progress, then marks it aborted).
   */
  public async abortRun(id: string): Promise<void> {
    const ref = this.runsCol.doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new CrawlRunError('not_found');
      const run = snap.data() as CrawlRunDocument;
      if (run.status === 'queued' || isStale(run)) {
        tx.update(ref, { status: 'aborted', abortRequested: true, finishedAt: Timestamp.now() });
      } else if (run.status === 'running') {
        tx.update(ref, { abortRequested: true });
      } else {
        throw new CrawlRunError('not_active');
      }
    });
  }

  /** Log lines written after chunk `afterSeq` (0 = from the start). */
  public async getLog(id: string, afterSeq: number): Promise<CrawlRunLogResponse> {
    const snap = await this.runsCol
      .doc(id)
      .collection(CRAWL_RUN_LOG)
      .where('seq', '>', afterSeq)
      .orderBy('seq')
      .get();
    const chunks = snap.docs.map((d) => d.data() as CrawlRunLogDocument);
    return {
      lines: chunks.flatMap((c) => c.lines),
      lastSeq: chunks.length ? chunks[chunks.length - 1].seq : afterSeq,
    };
  }
}
