import { Timestamp } from 'firebase-admin/firestore';
import type { LlmCompareDetail, LlmCompareSummary, LlmProvider, LlmSettings } from '@pantry-finder/shared';
import { COLLECTIONS, type LlmCompareDocument, type PantryDocument } from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';

const LIST_LIMIT = 20;
// Only what the list shows; the results (page text included) stay unread.
const SUMMARY_FIELDS = ['pantryId', 'pantryName', 'status', 'requestedBy', 'createdAt', 'finishedAt'];

export type LlmCompareErrorCode = 'not_found' | 'pantry_not_found' | 'no_website';

export class LlmCompareError extends Error {
  constructor(public readonly code: LlmCompareErrorCode) {
    super(code);
  }
}

function toSummary(id: string, doc: LlmCompareDocument): LlmCompareSummary {
  return {
    id,
    pantryId: doc.pantryId,
    pantryName: doc.pantryName,
    status: doc.status,
    createdAt: doc.createdAt.toDate().toISOString(),
    finishedAt: doc.finishedAt?.toDate().toISOString(),
    requestedBy: doc.requestedBy,
  };
}

/**
 * `llm_compares`: both LLMs' extraction of one pantry's site, side by side.
 * Queued here and executed by the crawler worker (tools/crawler/compare.ts).
 */
export class LlmCompareService {
  private readonly comparesCol = db.collection(COLLECTIONS.llmCompares);

  /** Most recent first. */
  public async list(): Promise<LlmCompareSummary[]> {
    const snapshot = await this.comparesCol
      .orderBy('createdAt', 'desc')
      .limit(LIST_LIMIT)
      .select(...SUMMARY_FIELDS)
      .get();
    return snapshot.docs.map((d) => toSummary(d.id, d.data() as LlmCompareDocument));
  }

  public async get(id: string): Promise<LlmCompareDetail> {
    const snap = await this.comparesCol.doc(id).get();
    if (!snap.exists) throw new LlmCompareError('not_found');
    const doc = snap.data() as LlmCompareDocument;
    return {
      ...toSummary(id, doc),
      url: doc.url,
      pages: doc.pages ?? [],
      serviceNames: doc.serviceNames ?? [],
      current: doc.current ?? [],
      results: doc.results ?? [],
      settings: doc.settings,
      error: doc.error,
    };
  }

  /** Queues a comparison for the worker; `settings` are validated by the caller. */
  public async start(
    pantryId: string,
    requestedBy: string,
    settings: Partial<Record<LlmProvider, LlmSettings>>,
  ): Promise<LlmCompareSummary> {
    const pantrySnap = await db.collection(COLLECTIONS.pantries).doc(pantryId).get();
    if (!pantrySnap.exists) throw new LlmCompareError('pantry_not_found');
    const pantry = pantrySnap.data() as PantryDocument;
    if (!pantry.website?.trim()) throw new LlmCompareError('no_website');

    const doc: LlmCompareDocument = {
      pantryId,
      pantryName: pantry.name,
      status: 'queued',
      requestedBy,
      createdAt: Timestamp.now(),
      ...(Object.keys(settings).length ? { settings } : {}),
    };
    const ref = await this.comparesCol.add(doc);
    return toSummary(ref.id, doc);
  }
}
