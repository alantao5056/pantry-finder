import { Timestamp } from 'firebase-admin/firestore';
import type { CrawlRunCounts, CrawlRunStatus } from '@pantry-finder/shared';

// Firestore shape of one crawler run (`crawl_runs`). Written by tools/crawler,
// read by the admin status page.
export interface CrawlRunDocument {
  // Target environment the run wrote to ('dev01' | 'dev02' | 'prod').
  env: string;
  status: CrawlRunStatus;
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  counts: CrawlRunCounts;
  // Most recent error messages, capped by the crawler.
  errors: string[];
}
