import type { CrawlRunSummary } from '@pantry-finder/shared';
import { db } from '../config/firebase';
import { CrawlRunDocument } from '../models/crawl-run.schema';

const LIST_LIMIT = 50;

export class CrawlRunService {
  private readonly runsCol = db.collection('crawl_runs');

  /** Most recent runs first. */
  public async listRuns(): Promise<CrawlRunSummary[]> {
    const snapshot = await this.runsCol.orderBy('startedAt', 'desc').limit(LIST_LIMIT).get();
    return snapshot.docs.map((doc) => {
      const run = doc.data() as CrawlRunDocument;
      return {
        id: doc.id,
        env: run.env,
        // Runs are only recorded in apply mode; older docs predate the field.
        mode: run.mode ?? 'apply',
        status: run.status,
        startedAt: run.startedAt.toDate().toISOString(),
        finishedAt: run.finishedAt?.toDate().toISOString(),
        counts: run.counts,
        errors: run.errors ?? [],
      };
    });
  }
}
