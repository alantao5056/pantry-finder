import { Timestamp } from 'firebase-admin/firestore';
import type { ReviewItemStatus, ReviewItemType } from '@pantry-finder/shared';

// Firestore shape of one entry in the unified admin review queue
// (`review_items`). Every source of "a human needs to decide" — user
// submissions now, crawler findings later — lands here, so the admin has a
// single queue. The item holds only what the list view needs plus references;
// the payload lives with its source (e.g. `pantry_submissions/{submissionId}`).
export interface ReviewItemDocument {
  type: ReviewItemType;
  status: ReviewItemStatus;
  // Denormalized for the list view (typically the pantry name / "City, ST").
  title: string;
  subtitle?: string;
  // type 'user_submission': the source submission.
  submissionId?: string;
  // The pantry this item created or concerns.
  pantryId?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  // Admin email.
  resolvedBy?: string;
  rejectionReason?: string;
}
