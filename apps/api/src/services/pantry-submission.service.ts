import { db } from '../config/firebase';
import { PantrySubmissionDocument } from '../models/pantry-submission.schema';

/**
 * Recursively drops keys whose value is `undefined`. The Firestore admin SDK
 * rejects `undefined` anywhere in a document (top level OR nested inside the
 * services/schedules arrays), so optional fields the controller left undefined
 * must be removed before writing.
 */
function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneUndefined(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out as T;
  }
  return value;
}

export class PantrySubmissionService {
  private readonly submissionsCol = db.collection('pantry_submissions');

  /**
   * Persists a reviewed-pending pantry submission to the moderation queue.
   * @param submission A fully-validated submission document (sans id).
   * @returns The id of the newly created Firestore document.
   */
  public async createSubmission(
    submission: PantrySubmissionDocument
  ): Promise<string> {
    const ref = await this.submissionsCol.add(pruneUndefined(submission));
    return ref.id;
  }
}
