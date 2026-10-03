// Firestore-side document shapes shared by the API and tools/crawler.
// SERVER-ONLY (imports firebase-admin types); reached via
// '@pantry-finder/shared/firestore'. These are the stored shapes — the wire
// shapes the admin app sees live in ../admin.ts.

import type { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import type {
  AddressFields,
  CrawlRunCounts,
  CrawlRunMode,
  CrawlRunOptions,
  CrawlRunStatus,
  EvalGrade,
  EvalVariantKey,
  LlmCompareResult,
  LlmCompareStatus,
  LlmProvider,
  LlmSettings,
  PantryChangeKind,
  ReviewItemStatus,
  ReviewItemType,
  SiteCheck,
  SuspiciousReason,
  TargetProposal,
} from '../admin.js';
import type { MappingTarget, TargetValue } from '../crawl.js';

// Where a pantry field's current value came from. `import` is the original
// bulk import; the rest are written by the admin/crawler pipeline
// (see docs/crawler-design.md). Crawled data outranks the original import.
export type FieldSource = 'import' | 'user_submission' | 'crawler' | 'admin';

// Pantry fields whose provenance is tracked in `fieldSources`.
export type TrackedPantryField =
  | 'name'
  | 'address1'
  | 'address2'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'phone'
  | 'email'
  | 'website'
  | 'aboutUs'
  | 'contactName'
  | 'notes'
  | 'schedules'
  | 'services';

export interface FieldProvenance {
  source: FieldSource;
  at: Timestamp;
}

export interface ScheduleSchema {
  startTime: string;
  endTime: string;
  weekDay: string;
  notes?: string;
  contactForHoursMessage?: string;
  everyOtherWeekIndicator?: boolean;
}

export interface ServiceSchema {
  name: string;
  categoryDescription: string;
  foodProgramTypeDescription: string;
  foodOfferings?: string[];
  notes?: string;
  schedules: ScheduleSchema[];
}

export interface GeoHashField {
  geohash: string;
  geopoint: GeoPoint;
}

// A pantry's address with the coordinates geocoded from it. Always written
// together: an address never moves without its coordinates.
export interface StoredLocation extends AddressFields {
  coordinates: GeoPoint;
  g: GeoHashField;
}

export interface PantryDocument {
  id: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email?: string;
  coordinates: GeoPoint;
  // GeoFirestore's index of `coordinates` (radius search reads it); rewritten
  // with every coordinates change.
  g?: GeoHashField;
  website?: string;
  aboutUs?: string;
  contactName?: string;
  notes?: string;
  heartCount?: number;
  schedules: ScheduleSchema[];
  services: ServiceSchema[];
  // Origin of the whole record: the upstream source's name for bulk-imported
  // pantries (with `pantryId` = that source's id), 'user_submission' for
  // approved submissions.
  source?: string;
  pantryId?: string;
  fieldSources?: Partial<Record<TrackedPantryField, FieldProvenance>>;
  // Present iff the pantry is in the crawl queue (tools/crawler/select.ts);
  // null until its first crawl.
  lastCrawledAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// One change-log entry (`pantry_changes`). Every write to a live pantry records
// what changed so it can be audited and rolled back.
//   create  — `newValue` is the full pantry document as written
//   update  — one entry per changed target, with `oldValue` / `newValue`
//             (null = the field was absent)
//   address — the address fields and coordinates, moved as one unit; `oldValue`
//             / `newValue` are `StoredLocation`s
//   archive / restore — pantry moved to / from `pantries_archive`
export interface PantryChangeDocument {
  pantryId: string;
  kind: PantryChangeKind;
  field?: TrackedPantryField;
  // Set on crawler-pipeline updates; finer than `field` for service schedules.
  target?: MappingTarget;
  oldValue?: unknown;
  newValue?: unknown;
  source: FieldSource;
  // Admin email, or 'crawler'.
  actor: string;
  runId?: string;
  reviewItemId?: string;
  // The field mapping that produced the value; marked `needs_recheck` on revert.
  mappingId?: string;
  // This entry undoes that change.
  revertOf?: string;
  revertedAt?: Timestamp;
  revertedBy?: string;
  createdAt: Timestamp;
}

// Payload of a `new_mapping` review item: the LLM's candidates per target.
export interface NewMappingPayload {
  website: string;
  fetchedAt: Timestamp;
  proposals: TargetProposal[];
  // Whether the site's stated address(es) match the pantry's. Absent on items
  // raised before the check existed.
  addressCheck?: SiteCheck;
  // Same for the site's phone numbers. Absent on older items and when the
  // pantry has no phone to compare.
  phoneCheck?: SiteCheck;
  // Set on resolve: chosen candidate index per target (null = rejected).
  confirmed?: Partial<Record<MappingTarget, number | null>>;
  // Set on resolve: the address the pantry was moved to (null = kept).
  confirmedAddress?: AddressFields | null;
}

// Payload of a `suspicious_value` review item: a value the crawler would have
// applied but held back.
export interface SuspiciousValuePayload {
  target: MappingTarget;
  // Absent for values not tied to a mapping (e.g. a website redirect).
  mappingId?: string;
  url: string;
  rawText: string;
  rawHash?: string;
  reasons: SuspiciousReason[];
  oldValue: TargetValue;
  newValue: TargetValue;
}

// One entry in the unified admin review queue (`review_items`). Every source of
// "a human needs to decide" lands here, so the admin has a single queue.
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
  // Crawler run that raised the item.
  runId?: string;
  newMapping?: NewMappingPayload;
  suspicious?: SuspiciousValuePayload;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  // Admin email.
  resolvedBy?: string;
  rejectionReason?: string;
}

// One crawler run (`crawl_runs`). Started from the CLI (tools/crawler) or
// queued by the admin and executed by the crawler worker.
export interface CrawlRunDocument {
  // Target environment the run wrote to ('dev01' | 'dev02' | 'prod'); empty
  // while queued (the worker fills it in).
  env: string;
  mode: CrawlRunMode;
  // Model id the run extracts with; written when the run starts.
  model?: string;
  status: CrawlRunStatus;
  // Request time while queued, then when the worker picked it up.
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  counts: CrawlRunCounts;
  // Most recent error messages, capped by the crawler.
  errors: string[];
  // Filters the run was started with.
  options?: CrawlRunOptions;
  // Admin email, for runs queued from the admin.
  requestedBy?: string;
  // Stop pressed in the admin; the worker winds the run down.
  abortRequested?: boolean;
  // Refreshed by the worker while running; a stale one means the worker died.
  heartbeatAt?: Timestamp;
}

// A chunk of a worker run's log (`crawl_runs/{runId}/log/{seq}`).
export interface CrawlRunLogDocument {
  // 1, 2, 3… in write order.
  seq: number;
  lines: string[];
  createdAt: Timestamp;
}

// One fetched URL (`crawl_sources/{sha256(url)}`).
export interface CrawlSourceDocument {
  url: string;
  host: string;
  // Page looks JS-rendered; skipped until a browser fetcher exists.
  // Absent until a fetch of the page succeeds.
  needsBrowser?: boolean;
  robotsAllowed: boolean;
  lastFetchedAt: Timestamp;
  // HTTP status, or 0 for network errors / timeouts.
  lastStatus: number;
  // After redirects.
  finalUrl?: string;
  lastError?: string;
}

export type FieldMappingStatus = 'proposed' | 'active' | 'rejected' | 'broken' | 'needs_recheck';

// Where one target of one pantry is read from (`field_mappings/{pantryId}_{target}`).
//   proposed      — waiting in a `new_mapping` review item
//   active        — confirmed; changes are applied automatically
//   rejected      — admin said this target has no source on the site; not re-proposed
//   broken        — region no longer found on the page
//   needs_recheck — a value it produced was reverted; changes go to review
export interface FieldMappingDocument {
  pantryId: string;
  target: MappingTarget;
  status: FieldMappingStatus;
  reviewItemId?: string;
  url?: string;
  selector?: string;
  textAnchor?: string;
  // sha256 of the region text last processed; unchanged text is skipped.
  lastRawHash?: string;
  confirmedBy?: string;
  confirmedAt?: Timestamp;
  updatedAt: Timestamp;
}

// A confirmed parse (`extraction_cache/{sha256(kind + raw text)}`), reused
// instead of calling the LLM when the same region text shows up again.
export interface ExtractionCacheDocument {
  kind: 'text' | 'schedules';
  value: TargetValue;
  confirmedBy: string;
  confirmedAt: Timestamp;
}

// LLM tier comparison run (`llm_evals/{id}`, items in `llm_evals/{id}/items`).
export interface LlmEvalDocument {
  env: string;
  models: string[];
  itemCount: number;
  createdAt: Timestamp;
}

export interface LlmEvalItemDocument {
  pantryId: string;
  pantryName: string;
  url: string;
  variants: Record<
    EvalVariantKey,
    { model: string; proposals: TargetProposal[]; inputTokens: number; outputTokens: number; error?: string }
  >;
  grades: Record<EvalVariantKey, Partial<Record<MappingTarget, EvalGrade>>>;
}

// Both LLMs' first-visit extraction of one pantry's site (`llm_compares/{id}`):
// queued by the admin (LLM eval page), filled in by the crawler worker.
// Touches no pantry data.
export interface LlmCompareDocument {
  pantryId: string;
  pantryName: string;
  status: LlmCompareStatus;
  // Admin email.
  requestedBy: string;
  createdAt: Timestamp;
  finishedAt?: Timestamp;
  // Per provider, as requested; absent providers use the env settings.
  settings?: Partial<Record<LlmProvider, LlmSettings>>;
  // The fields below are written by the worker.
  env?: string;
  url?: string;
  pages?: string[];
  serviceNames?: string[];
  current?: { target: MappingTarget; value: TargetValue }[];
  results?: LlmCompareResult[];
  error?: string;
}
