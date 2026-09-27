// Wire shapes for the admin API (`/admin/*`), consumed by apps/admin.
//
// Unlike the public `Pantry` DTO, `PantryDraft` deliberately mirrors the
// Firestore field names (address1, aboutUs, startTime, ...): admins edit the
// stored record itself, so there is no public-facing remapping to hide behind.
// Timestamps travel as ISO strings.

export type ReviewItemType =
  | 'new_mapping'
  | 'broken_mapping'
  | 'new_pantry'
  | 'match_candidate'
  | 'missing_pantry'
  | 'suspicious_value'
  | 'user_submission';

export type ReviewItemStatus = 'pending' | 'approved' | 'rejected';

export interface AdminProfile {
  email: string;
  firstName: string;
  lastName: string;
}

export interface ReviewItemSummary {
  id: string;
  type: ReviewItemType;
  status: ReviewItemStatus;
  title: string;
  subtitle?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ListReviewItemsResponse {
  items: ReviewItemSummary[];
}

export interface ScheduleDraft {
  weekDay: string;
  startTime: string;
  endTime: string;
  notes?: string;
  everyOtherWeekIndicator?: boolean;
}

export interface ServiceDraft {
  name: string;
  categoryDescription: string;
  foodProgramTypeDescription?: string;
  foodOfferings: string[];
  notes?: string;
  schedules: ScheduleDraft[];
}

export interface PantryDraft {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
  website?: string;
  aboutUs?: string;
  contactName?: string;
  notes?: string;
  schedules: ScheduleDraft[];
  services: ServiceDraft[];
}

export interface SubmitterInfo {
  firstName: string;
  lastName: string;
  email: string;
  relationship: string;
  accountEmail?: string;
}

export interface NearbyPantry {
  id: string;
  name: string;
  address: string;
  distanceMeters: number;
}

export interface SubmissionReviewDetail {
  item: ReviewItemSummary;
  submissionId: string;
  submittedAt: string;
  submitter: SubmitterInfo;
  draft: PantryDraft;
  /** Geocoded submitted address; null when the geocoder found no match. */
  location: { latitude: number; longitude: number } | null;
  /** Existing pantries near `location` — possible duplicates. */
  nearby: NearbyPantry[];
  /** Set once approved. */
  pantryId?: string;
  /** Set once rejected. */
  rejectionReason?: string;
}

export interface ApproveSubmissionRequest {
  draft: PantryDraft;
}

export interface ApproveSubmissionResponse {
  pantryId: string;
}

export interface RejectReviewItemRequest {
  reason: string;
}

export type CrawlRunStatus = 'running' | 'completed' | 'failed' | 'aborted';

export interface CrawlRunCounts {
  fetched: number;
  failed: number;
  autoUpdated: number;
  reviewItemsCreated: number;
}

export interface CrawlRunSummary {
  id: string;
  env: string;
  status: CrawlRunStatus;
  startedAt: string;
  finishedAt?: string;
  counts: CrawlRunCounts;
  errors: string[];
}

export interface ListCrawlRunsResponse {
  runs: CrawlRunSummary[];
}
