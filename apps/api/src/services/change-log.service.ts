import { Timestamp } from 'firebase-admin/firestore';
import type { PantryChangeSummary, RevertConflict, RevertRunResponse } from '@pantry-finder/shared';
import { COLLECTIONS, PantryWriteError, revertChange } from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';
import { invalidatePantryCaches } from '../cache/pantryCaches';
import { PantryChangeDocument } from '../models/pantry-change.schema';

const PAGE_SIZE = 50;

function toSummary(id: string, c: PantryChangeDocument): PantryChangeSummary {
  return {
    id,
    pantryId: c.pantryId,
    kind: c.kind,
    field: c.field,
    target: c.target,
    // A `create` entry holds the whole pantry document; the list only needs to know it happened.
    oldValue: c.kind === 'create' ? undefined : c.oldValue,
    newValue: c.kind === 'create' ? undefined : c.newValue,
    source: c.source,
    actor: c.actor,
    runId: c.runId,
    reviewItemId: c.reviewItemId,
    createdAt: c.createdAt.toDate().toISOString(),
    revertOf: c.revertOf,
    revertedAt: c.revertedAt?.toDate().toISOString(),
    revertedBy: c.revertedBy,
  };
}

/** The `pantry_changes` log and rollback. */
export class ChangeLogService {
  private readonly changesCol = db.collection(COLLECTIONS.pantryChanges);

  /** Newest first, optionally for one crawl run or one pantry. `cursor` is the last id of the previous page. */
  public async list(filter: { runId?: string; pantryId?: string; cursor?: string }): Promise<{
    changes: PantryChangeSummary[];
    nextCursor?: string;
  }> {
    let query: FirebaseFirestore.Query = this.changesCol;
    if (filter.runId) query = query.where('runId', '==', filter.runId);
    if (filter.pantryId) query = query.where('pantryId', '==', filter.pantryId);
    query = query.orderBy('createdAt', 'desc');
    if (filter.cursor) {
      const cursorSnap = await this.changesCol.doc(filter.cursor).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }
    const snapshot = await query.limit(PAGE_SIZE + 1).get();
    const docs = snapshot.docs.slice(0, PAGE_SIZE);
    return {
      changes: docs.map((d) => toSummary(d.id, d.data() as PantryChangeDocument)),
      nextCursor: snapshot.docs.length > PAGE_SIZE ? docs[docs.length - 1].id : undefined,
    };
  }

  /** @throws PantryWriteError */
  public async revert(changeId: string, adminEmail: string): Promise<void> {
    const pantry = await db.runTransaction((tx) => revertChange(tx, db, changeId, adminEmail, Timestamp.now()));
    await invalidatePantryCaches(pantry);
  }

  /**
   * Reverts every not-yet-reverted field update of a crawl run, newest first
   * (so stacked changes to one field unwind in order). Changes that can't be
   * reverted — typically because the field was edited again since — are
   * skipped and reported.
   */
  public async revertRun(runId: string, adminEmail: string): Promise<RevertRunResponse> {
    const snapshot = await this.changesCol.where('runId', '==', runId).orderBy('createdAt', 'desc').get();
    let reverted = 0;
    const conflicts: RevertConflict[] = [];
    for (const doc of snapshot.docs) {
      const c = doc.data() as PantryChangeDocument;
      if (c.kind !== 'update' || c.revertedAt || c.revertOf) continue;
      try {
        await this.revert(doc.id, adminEmail);
        reverted++;
      } catch (err) {
        if (!(err instanceof PantryWriteError)) throw err;
        conflicts.push({ changeId: doc.id, reason: err.message });
      }
    }
    return { reverted, conflicts };
  }
}
