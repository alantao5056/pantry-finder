import { db } from '../config/firebase';
import { PantrySubmissionDocument } from '../models/pantry-submission.schema';
import { ReviewItemDocument } from '../models/review-item.schema';
import { pruneUndefined } from '../utils/firestore.util';

export class PantrySubmissionService {
  private readonly submissionsCol = db.collection('pantry_submissions');
  private readonly reviewItemsCol = db.collection('review_items');

  /**
   * Persists a pending pantry submission and, in the same batch, the
   * `review_items` entry that puts it in the admin review queue.
   * @param submission A fully-validated submission document (sans id).
   * @returns The id of the newly created submission document.
   */
  public async createSubmission(
    submission: PantrySubmissionDocument
  ): Promise<string> {
    const submissionRef = this.submissionsCol.doc();
    const reviewItem: ReviewItemDocument = {
      type: 'user_submission',
      status: 'pending',
      title: submission.name,
      subtitle: [submission.city, submission.state].filter(Boolean).join(', '),
      submissionId: submissionRef.id,
      createdAt: submission.createdAt,
    };

    const batch = db.batch();
    batch.create(submissionRef, pruneUndefined(submission));
    batch.create(this.reviewItemsCol.doc(), pruneUndefined(reviewItem));
    await batch.commit();
    return submissionRef.id;
  }
}
