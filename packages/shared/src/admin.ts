// Wire shapes for the admin API (`/admin/*`), consumed by apps/admin.
//
// Unlike the public `Pantry` DTO, `PantryDraft` deliberately mirrors the
// Firestore field names (address1, aboutUs, startTime, ...): admins edit the
// stored record itself, so there is no public-facing remapping to hide behind.
// Timestamps travel as ISO strings.

import type { MappingTarget, TargetValue } from './crawl.js';

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
  /** `new_mapping` items: result of the site address check. */
  addressCheck?: SiteCheckStatus;
  /** `new_mapping` items: result of the site phone check. */
  phoneCheck?: SiteCheckStatus;
}

export interface ListReviewItemsResponse {
  items: ReviewItemSummary[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  nextCursor?: string;
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
  email?: string;
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

/**
 * `queued`: requested from the admin, waiting for the crawler worker to pick
 * it up. Runs started from the CLI begin at `running`.
 */
export type CrawlRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted';

/** A queued or running run; at most one exists at a time. */
export const ACTIVE_CRAWL_RUN_STATUSES: readonly CrawlRunStatus[] = ['queued', 'running'];

export interface CrawlRunCounts {
  fetched: number;
  failed: number;
  autoUpdated: number;
  reviewItemsCreated: number;
}

export type CrawlRunMode = 'dry-run' | 'apply';

/** The LLMs the crawler can extract with (tools/crawler/extract). */
export type LlmProvider = 'deepseek' | 'gemini';

export const LLM_PROVIDERS: readonly LlmProvider[] = ['deepseek', 'gemini'];
export const DEFAULT_LLM_PROVIDER: LlmProvider = 'deepseek';

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
};

export function isLlmProvider(value: unknown): value is LlmProvider {
  return (LLM_PROVIDERS as readonly unknown[]).includes(value);
}

/** DeepSeek `reasoning_effort` when thinking is on (api-docs.deepseek.com, 2026-10). */
export type DeepSeekReasoningEffort = 'low' | 'high' | 'max';
export const DEEPSEEK_REASONING_EFFORTS: readonly DeepSeekReasoningEffort[] = ['low', 'high', 'max'];

/** Gemini `reasoning_effort`; the lowest a model accepts depends on the model. */
export type GeminiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export const GEMINI_REASONING_EFFORTS: readonly GeminiReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

/** One provider's settings for a run or comparison; a field left out uses the env default. */
export interface LlmSettings {
  model?: string;
  /** DeepSeek only: absent = thinking off; set = on, with this effort. */
  thinking?: DeepSeekReasoningEffort;
  /** Gemini only: absent = GEMINI_REASONING_EFFORT. */
  reasoningEffort?: GeminiReasoningEffort;
}

/** The models offered in the admin; add prices for new ones to the admin's MODEL_PRICES. */
export const LLM_MODELS: Record<LlmProvider, readonly string[]> = {
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  gemini: [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
  ],
};

/** Null when `value` is valid `LlmSettings` for the provider, else what is wrong. */
export function llmSettingsError(provider: LlmProvider, value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'settings must be an object.';
  const allowed: (keyof LlmSettings)[] = ['model', provider === 'deepseek' ? 'thinking' : 'reasoningEffort'];
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (!(allowed as string[]).includes(key)) return `${key} is not a ${LLM_PROVIDER_LABELS[provider]} setting.`;
  }
  const s = value as LlmSettings;
  if (s.model !== undefined && !LLM_MODELS[provider].includes(s.model)) {
    return `model must be one of ${LLM_MODELS[provider].join(', ')}.`;
  }
  if (s.thinking !== undefined && !DEEPSEEK_REASONING_EFFORTS.includes(s.thinking)) {
    return `thinking must be one of ${DEEPSEEK_REASONING_EFFORTS.join(', ')}.`;
  }
  if (s.reasoningEffort !== undefined && !GEMINI_REASONING_EFFORTS.includes(s.reasoningEffort)) {
    return `reasoningEffort must be one of ${GEMINI_REASONING_EFFORTS.join(', ')}.`;
  }
  return null;
}

/** "thinking high", "thinking off", "effort low", "effort (env)". */
export function llmSettingsLabel(provider: LlmProvider, settings: LlmSettings | undefined): string {
  if (provider === 'deepseek') return `thinking ${settings?.thinking ?? 'off'}`;
  return `effort ${settings?.reasoningEffort ?? '(env)'}`;
}

export interface CrawlRunSummary {
  id: string;
  env: string;
  mode: CrawlRunMode;
  /** Model id the run extracts with; set once the crawler picks the run up. */
  model?: string;
  status: CrawlRunStatus;
  startedAt: string;
  finishedAt?: string;
  counts: CrawlRunCounts;
  errors: string[];
  options: CrawlRunOptions;
  /** Admin email, for runs started from the admin. */
  requestedBy?: string;
  /** Stop was pressed; the worker finishes the pantries in progress. */
  abortRequested: boolean;
  /** Running, but the worker hasn't reported in for a while (it likely died). */
  stale: boolean;
}

export interface CrawlRunOptions {
  limit?: number;
  pantryId?: string;
  /** Absent on runs from before the choice existed (DeepSeek). */
  llm?: LlmProvider;
  /** Absent: env defaults (and DeepSeek thinking off). */
  settings?: LlmSettings;
}

export interface ListCrawlRunsResponse {
  runs: CrawlRunSummary[];
}

export interface StartCrawlRunRequest {
  mode: CrawlRunMode;
  /** Pantries to crawl (default 100); ignored with `pantryId`. */
  limit?: number;
  /** Crawl just this pantry. */
  pantryId?: string;
  /** Default DeepSeek. */
  llm?: LlmProvider;
  /** For `llm`; default the env settings. */
  settings?: LlmSettings;
}

export const DEFAULT_CRAWL_LIMIT = 100;
export const MAX_CRAWL_LIMIT = 1000;

export interface CrawlRunLogResponse {
  lines: string[];
  /** Pass back as `afterSeq` to fetch only newer lines. */
  lastSeq: number;
}

/**
 * DeepSeek doubles prices Mon–Fri 01:00–04:00 and 06:00–10:00 UTC
 * (docs/crawler-design.md); runs are best started outside those windows.
 */
export function isPeakHour(now = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) return false;
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

// ---- Redis status (admin `/redis`) ----

/** Snapshot of the API's Redis server, from PING + INFO. */
export interface RedisServerStatus {
  /** ioredis connection state ("ready", "reconnecting", …). */
  clientStatus: string;
  pingMs: number;
  version: string;
  uptimeSeconds: number;
  connectedClients: number;
  opsPerSec: number;
  usedMemoryBytes: number;
  /** 0 when Redis has no memory limit. */
  maxMemoryBytes: number;
  maxMemoryPolicy: string;
  fragmentationRatio: number;
  /** Keys dropped to stay under maxmemory since Redis started. */
  evictedKeys: number;
  expiredKeys: number;
  /** Server-wide key lookups since Redis started (all caches together). */
  keyspaceHits: number;
  keyspaceMisses: number;
  totalKeys: number;
  /** Last RDB snapshot; absent when Redis has never saved. */
  lastSaveAt?: string;
  lastSaveOk: boolean;
  keyGroups: { label: string; prefix: string }[];
}

export type RedisStatusResponse =
  /** REDIS_URL unset: the API uses its in-process caches. */
  | { backend: 'in-memory' }
  | { backend: 'redis'; connected: false; clientStatus: string; error: string }
  | ({ backend: 'redis'; connected: true } & RedisServerStatus);

export interface RedisKeyGroup {
  label: string;
  /** Empty for the catch-all group of keys no known cache owns. */
  prefix: string;
  /** Null when the TTL varies per key (rate-limit windows) or is unknown. */
  ttlMs: number | null;
  count: number;
  /** Estimated from a sample of the group's keys. */
  approxBytes: number;
}

export interface RedisKeyStatsResponse {
  groups: RedisKeyGroup[];
  scanned: number;
  /** The scan stopped at its key cap; counts are a lower bound. */
  truncated: boolean;
}

export interface RedisEntryResponse {
  /** Full key. */
  key: string;
  exists: boolean;
  /** Redis TYPE ("string", "zset", …). */
  type?: string;
  /** Null when the key has no expiry. */
  ttlMs?: number | null;
  /** Strings only. */
  value?: string;
  valueTruncated?: boolean;
  /** String length, or zset member count. */
  size?: number;
}

export interface RedisEntryDeleteResponse {
  key: string;
  deleted: boolean;
}

// ---- App config (admin `/settings`) ----

/** TTL, in minutes, of each group of API caches. */
export interface CacheTtlMinutes {
  /** Address, ZIP and location lookups. */
  geocode: number;
  /** Pantry detail by doc id. */
  pantry: number;
  /** The browse index: states, cities, and each city's pantry list. */
  cityState: number;
  /** User profiles. */
  user: number;
}

export const MIN_CACHE_TTL_MINUTES = 1;
export const MAX_CACHE_TTL_MINUTES = 30 * 24 * 60; // 30 days

/** Runtime settings stored in the Firestore `appConfig` collection. */
export interface AppConfig {
  /** Off: searching requires an account. */
  anonymousSearchEnabled: boolean;
  cacheTtlMinutes: CacheTtlMinutes;
}

/** What the API uses for any setting missing from Firestore. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  anonymousSearchEnabled: true,
  cacheTtlMinutes: {
    geocode: 24 * 60,
    pantry: 24 * 60,
    cityState: 48 * 60,
    user: 60,
  },
};

export interface AppConfigResponse {
  config: AppConfig;
  /** Absent until the settings are first saved from the admin. */
  updatedAt?: string;
  updatedBy?: string;
}

// ---- Crawler mappings (review types `new_mapping` / `suspicious_value`) ----

/** One place on a crawled page that a target's value could come from. */
export interface MappingCandidate {
  url: string;
  selector: string;
  /** Heading text the region sits under; used when the selector stops matching. */
  textAnchor?: string;
  rawText: string;
  /** The LLM's parse of `rawText`, normalized to the stored format. */
  value: TargetValue;
  /** The LLM flagged its own parse as unsure. */
  uncertain: boolean;
}

export interface TargetProposal {
  target: MappingTarget;
  candidates: MappingCandidate[];
}

/**
 * Whether a crawled site states the pantry's address (or phone): `match` when
 * one of the values found on it is the stored one, `mismatch` when values were
 * found but none is, `not_found` when the site states none.
 */
export type SiteCheckStatus = 'match' | 'mismatch' | 'not_found';

export interface SiteCheck {
  status: SiteCheckStatus;
  /** Values as written on the site. */
  found: string[];
}

/** A pantry's postal address, as stored on the pantry document. */
export interface AddressFields {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface MappingReviewField {
  target: MappingTarget;
  currentValue: TargetValue;
  candidates: MappingCandidate[];
  /** Once resolved: the candidate that was confirmed (null = rejected). */
  confirmedCandidate?: number | null;
}

export interface MappingReviewDetail {
  item: ReviewItemSummary;
  pantryId: string;
  pantryName: string;
  website: string;
  fetchedAt: string;
  /** The pantry's stored address on one line. */
  storedAddress: string;
  addressCheck?: SiteCheck;
  /** Once resolved: the address the pantry was moved to (null = kept). Absent on older items. */
  confirmedAddress?: AddressFields | null;
  storedPhone?: string;
  phoneCheck?: SiteCheck;
  /** Service names by index, for labelling `services.<i>.schedules` targets. */
  serviceNames: string[];
  fields: MappingReviewField[];
  rejectionReason?: string;
}

export interface ConfirmMappingField {
  target: MappingTarget;
  /** Index into that target's candidates; null rejects the target. */
  candidateIndex: number | null;
  /** The (possibly admin-edited) value to apply; required when a candidate is picked. */
  value?: TargetValue;
}

export interface ConfirmMappingRequest {
  fields: ConfirmMappingField[];
  /** New address for the pantry (re-geocoded on confirm); absent keeps the current one. */
  address?: AddressFields;
}

export interface ConfirmMappingResponse {
  /** Number of pantry changes made (an address update counts as one). */
  applied: number;
}

export type SuspiciousReason =
  | 'emptied_schedules'
  | 'closure_words'
  | 'uncertain'
  | 'needs_recheck'
  | 'redirect';

export interface SuspiciousReviewDetail {
  item: ReviewItemSummary;
  pantryId: string;
  pantryName: string;
  target: MappingTarget;
  url: string;
  rawText: string;
  reasons: SuspiciousReason[];
  currentValue: TargetValue;
  proposedValue: TargetValue;
  /** Service names by index, for labelling `services.<i>.schedules` targets. */
  serviceNames: string[];
  rejectionReason?: string;
}

export interface ApproveValueRequest {
  value: TargetValue;
}

// ---- Change log ----

export type PantryChangeKind = 'create' | 'update' | 'address' | 'archive' | 'restore';

export interface PantryChangeSummary {
  id: string;
  pantryId: string;
  kind: PantryChangeKind;
  field?: string;
  target?: MappingTarget;
  oldValue?: unknown;
  newValue?: unknown;
  source: string;
  actor: string;
  runId?: string;
  reviewItemId?: string;
  createdAt: string;
  /** This entry is itself a revert of that change. */
  revertOf?: string;
  revertedAt?: string;
  revertedBy?: string;
}

export interface ListChangesResponse {
  changes: PantryChangeSummary[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  nextCursor?: string;
}

export interface RevertConflict {
  changeId: string;
  reason: string;
}

export interface RevertRunResponse {
  reverted: number;
  conflicts: RevertConflict[];
}

// ---- LLM tier comparison ----

export type EvalGrade = 'correct' | 'partial' | 'wrong';
export type EvalVariantKey = 'A' | 'B';

export interface LlmEvalVariant {
  model: string;
  proposals: TargetProposal[];
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

export interface LlmEvalItem {
  id: string;
  pantryId: string;
  pantryName: string;
  url: string;
  /** Which model is A / B is shuffled per item so grading stays blind. */
  variants: Record<EvalVariantKey, LlmEvalVariant>;
  /** Per variant, per target. */
  grades: Record<EvalVariantKey, Partial<Record<MappingTarget, EvalGrade>>>;
}

export interface LlmEvalModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  grades: Record<EvalGrade, number>;
}

export interface LlmEvalSummary {
  id: string;
  env: string;
  createdAt: string;
  itemCount: number;
  models: LlmEvalModelStats[];
}

export interface ListLlmEvalsResponse {
  evals: LlmEvalSummary[];
}

export interface LlmEvalDetail {
  summary: LlmEvalSummary;
  items: LlmEvalItem[];
}

export interface GradeLlmEvalRequest {
  variant: EvalVariantKey;
  target: MappingTarget;
  grade: EvalGrade;
}

// ---- LLM comparison on one pantry ----

/** `queued`: requested from the admin, waiting for the crawler worker. */
export type LlmCompareStatus = 'queued' | 'running' | 'completed' | 'failed';

/** One LLM's first-visit extraction of the pantry's site. */
export interface LlmCompareResult {
  provider: LlmProvider;
  model: string;
  proposals: TargetProposal[];
  /** Addresses / phone numbers the LLM read off the site, checked against the stored ones. */
  addressCheck?: SiteCheck;
  /** Absent when the pantry has no phone to compare. */
  phoneCheck?: SiteCheck;
  /** Phone numbers as written on the site. */
  phones: string[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** The settings the call used, env defaults resolved; absent on older comparisons. */
  settings?: LlmSettings;
  error?: string;
}

export interface LlmCompareSummary {
  id: string;
  pantryId: string;
  pantryName: string;
  status: LlmCompareStatus;
  createdAt: string;
  finishedAt?: string;
  requestedBy: string;
}

export interface LlmCompareDetail extends LlmCompareSummary {
  /** Homepage after redirects. */
  url?: string;
  /** The pages shown to both LLMs. */
  pages: string[];
  /** Service names by index, for labelling `services.<i>.schedules` targets. */
  serviceNames: string[];
  /** Every target asked for, with the pantry's stored value. */
  current: { target: MappingTarget; value: TargetValue }[];
  results: LlmCompareResult[];
  /** As requested (for running it again); absent providers used the env settings. */
  settings?: Partial<Record<LlmProvider, LlmSettings>>;
  /** Why the comparison as a whole failed (site unreachable, …). */
  error?: string;
}

export interface StartLlmCompareRequest {
  pantryId: string;
  /** Per provider; default the env settings. */
  settings?: Partial<Record<LlmProvider, LlmSettings>>;
}

export interface ListLlmComparesResponse {
  compares: LlmCompareSummary[];
}
