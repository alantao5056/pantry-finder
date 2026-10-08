import { Response } from 'express';
import type {
  AddressFields,
  AppConfig,
  CacheTtlMinutes,
  ConfirmMappingField,
  CrawlRunMode,
  EvalGrade,
  EvalVariantKey,
  LlmProvider,
  LlmSettings,
  MappingTarget,
  PantryDraft,
  ReviewItemStatus,
  ScheduleDraft,
  ServiceDraft,
  TargetValue,
} from '@pantry-finder/shared';
import {
  DEFAULT_CRAWL_LIMIT,
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDERS,
  MAX_CACHE_TTL_MINUTES,
  MAX_CRAWL_LIMIT,
  MIN_CACHE_TTL_MINUTES,
  isLlmProvider,
  isMappingTarget,
  isValidStateSlug,
  llmSettingsError,
  normalizeEmail,
  parseTarget,
  pruneUndefined,
} from '@pantry-finder/shared';
import { PantryWriteError, type PantryWriteErrorCode } from '@pantry-finder/shared/firestore';
import { AuthedRequest } from '../middleware/auth.middleware';
import { ReviewError, ReviewService } from '../services/review.service';
import {
  CrawlRunError,
  CrawlRunService,
  LIST_LIMIT as CRAWL_RUN_LIST_LIMIT,
  type CrawlRunErrorCode,
} from '../services/crawl-run.service';
import { MappingReviewService } from '../services/mapping-review.service';
import { ChangeLogService } from '../services/change-log.service';
import { LlmCompareError, LlmCompareService, type LlmCompareErrorCode } from '../services/llm-compare.service';
import { LlmEvalService } from '../services/llm-eval.service';
import { PantryCacheService } from '../services/pantry-cache.service';
import { RedisStatusService } from '../services/redis-status.service';
import { UserService } from '../services/user.service';
import { isValidTtlMinutes, readAppConfig, updateAppConfig } from '../services/app-config.service';
import { MAX_ABOUT, MAX_ARRAY, MAX_STR, str } from '../utils/validation.util';

const REVIEW_STATUSES: ReviewItemStatus[] = ['pending', 'approved', 'rejected'];

const REVIEW_ERROR_STATUS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Review item not found.' },
  wrong_type: { status: 400, error: 'This review item is of a different type.' },
  invalid: { status: 400, error: 'Invalid request.' },
  not_pending: { status: 409, error: 'This review item has already been resolved.' },
  geocode_failed: { status: 422, error: 'The address could not be geocoded. Correct it and try again.' },
};

function parseSchedule(raw: unknown): ScheduleDraft | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const weekDay = str(r.weekDay, 20);
  const startTime = str(r.startTime, 20);
  const endTime = str(r.endTime, 20);
  if (!weekDay || !startTime || !endTime) return null;
  return {
    weekDay,
    startTime,
    endTime,
    notes: str(r.notes, 200) || undefined,
    everyOtherWeekIndicator: r.everyOtherWeekIndicator === true || undefined,
  };
}

function parseSchedules(raw: unknown): ScheduleDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseSchedule)
    .filter((s): s is ScheduleDraft => s !== null)
    .slice(0, MAX_ARRAY);
}

function parseService(raw: unknown): ServiceDraft | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name, 100);
  if (!name) return null;
  return {
    name,
    categoryDescription: str(r.categoryDescription, 100),
    foodProgramTypeDescription: str(r.foodProgramTypeDescription, 100) || undefined,
    foodOfferings: Array.isArray(r.foodOfferings)
      ? r.foodOfferings.map((f) => str(f, 100)).filter(Boolean).slice(0, MAX_ARRAY)
      : [],
    notes: str(r.notes, MAX_STR) || undefined,
    schedules: parseSchedules(r.schedules),
  };
}

const CRAWL_RUN_ERROR_STATUS: Record<CrawlRunErrorCode, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Crawl run not found.' },
  active_run: { status: 409, error: 'A crawl run is already queued or running.' },
  not_active: { status: 409, error: 'This run has already finished.' },
};

const LLM_COMPARE_ERROR_STATUS: Record<LlmCompareErrorCode, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Comparison not found.' },
  pantry_not_found: { status: 404, error: 'Pantry not found.' },
  no_website: { status: 400, error: 'This pantry has no website to crawl.' },
};

/** Validated settings without undefined fields; undefined when nothing is set (env defaults). */
function nonEmptySettings(settings: LlmSettings | undefined): LlmSettings | undefined {
  const pruned = pruneUndefined(settings ?? {});
  return Object.keys(pruned).length ? pruned : undefined;
}

const PANTRY_WRITE_ERROR_STATUS:Record<PantryWriteErrorCode, number> = {
  not_found: 404,
  bad_target: 400,
  not_revertible: 400,
  already_reverted: 409,
  conflict: 409,
};

const EVAL_GRADES: EvalGrade[] = ['correct', 'partial', 'wrong'];

/** A target value from the admin: a schedule list or text, matching the target. */
function parseTargetValue(target: MappingTarget, raw: unknown): TargetValue | null {
  if (parseTarget(target)?.kind === 'schedules') return Array.isArray(raw) ? parseSchedules(raw) : null;
  return typeof raw === 'string' ? str(raw, MAX_ABOUT) : null;
}

function parseConfirmFields(raw: unknown): ConfirmMappingField[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ARRAY) return null;
  const fields: ConfirmMappingField[] = [];
  for (const f of raw) {
    const r = (f ?? {}) as Record<string, unknown>;
    const target = r.target;
    if (typeof target !== 'string' || !isMappingTarget(target)) return null;
    if (r.candidateIndex === null) {
      fields.push({ target, candidateIndex: null });
      continue;
    }
    if (!Number.isInteger(r.candidateIndex) || (r.candidateIndex as number) < 0) return null;
    let value: TargetValue | undefined;
    if (r.value !== undefined) {
      const parsed = parseTargetValue(target, r.value);
      if (parsed === null) return null;
      value = parsed;
    }
    fields.push({ target, candidateIndex: r.candidateIndex as number, value });
  }
  return fields;
}

function parseAddressFields(r: Record<string, unknown>): AddressFields {
  return {
    address1: str(r.address1),
    address2: str(r.address2, 200) || undefined,
    city: str(r.city),
    state: str(r.state, 100).toUpperCase(),
    zipCode: str(r.zipCode, 20),
  };
}

/** Names of the required address fields that are missing or invalid. */
function invalidAddressFields(a: AddressFields): string[] {
  const missing: string[] = [];
  if (!a.address1) missing.push('address1');
  if (!a.city) missing.push('city');
  if (!a.state || !isValidStateSlug(a.state.toLowerCase())) missing.push('state');
  if (!a.zipCode) missing.push('zipCode');
  return missing;
}

/** Validates an admin-edited draft; returns the missing/invalid field names on failure. */
function parseDraft(raw: unknown): { draft: PantryDraft } | { missing: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const draft: PantryDraft = {
    name: str(r.name),
    ...parseAddressFields(r),
    phone: str(r.phone, 40) || undefined,
    email: normalizeEmail(str(r.email, 200)) || undefined,
    website: str(r.website, 300) || undefined,
    aboutUs: str(r.aboutUs, MAX_ABOUT) || undefined,
    contactName: str(r.contactName, 200) || undefined,
    notes: str(r.notes, MAX_ABOUT) || undefined,
    schedules: parseSchedules(r.schedules),
    services: Array.isArray(r.services)
      ? r.services
          .map(parseService)
          .filter((s): s is ServiceDraft => s !== null)
          .slice(0, MAX_ARRAY)
      : [],
  };

  const missing = [...(draft.name ? [] : ['name']), ...invalidAddressFields(draft)];
  return missing.length ? { missing } : { draft };
}

/** Validates the admin's settings; returns the invalid field names on failure. */
function parseAppConfig(raw: unknown): { config: AppConfig } | { invalid: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const { anonymousSearchEnabled } = r;
  const { geocode, pantry, cityState, user } = (r.cacheTtlMinutes ?? {}) as Partial<
    Record<keyof CacheTtlMinutes, unknown>
  >;

  if (
    typeof anonymousSearchEnabled === 'boolean' &&
    isValidTtlMinutes(geocode) &&
    isValidTtlMinutes(pantry) &&
    isValidTtlMinutes(cityState) &&
    isValidTtlMinutes(user)
  ) {
    return { config: { anonymousSearchEnabled, cacheTtlMinutes: { geocode, pantry, cityState, user } } };
  }

  return {
    invalid: [
      ...(typeof anonymousSearchEnabled === 'boolean' ? [] : ['anonymousSearchEnabled']),
      ...(isValidTtlMinutes(geocode) ? [] : ['geocode']),
      ...(isValidTtlMinutes(pantry) ? [] : ['pantry']),
      ...(isValidTtlMinutes(cityState) ? [] : ['cityState']),
      ...(isValidTtlMinutes(user) ? [] : ['user']),
    ],
  };
}

export class AdminController {
  private readonly reviewService = new ReviewService();
  private readonly crawlRunService = new CrawlRunService();
  private readonly userService = new UserService();
  private readonly mappingReviewService = new MappingReviewService();
  private readonly changeLogService = new ChangeLogService();
  private readonly llmEvalService = new LlmEvalService();
  private readonly llmCompareService = new LlmCompareService();
  private readonly pantryCacheService = new PantryCacheService();
  private readonly redisStatusService = new RedisStatusService();

  public async me(req: AuthedRequest, res: Response): Promise<void> {
    const profile = await this.userService.getUserProfile(req.user!.sub);
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ email: profile.email, firstName: profile.firstName, lastName: profile.lastName });
  }

  public async listReviewItems(req: AuthedRequest, res: Response): Promise<void> {
    const status = (req.query.status ?? 'pending') as ReviewItemStatus;
    if (!REVIEW_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of ${REVIEW_STATUSES.join(', ')}.` });
      return;
    }
    res.json(await this.reviewService.listItems(status, str(req.query.cursor, 100) || undefined));
  }

  public async getReviewItem(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      res.json(await this.reviewService.getItem(String(req.params.id)));
    });
  }

  public async getSubmissionReview(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      res.json(await this.reviewService.getSubmissionDetail(String(req.params.id)));
    });
  }

  public async approveSubmission(req: AuthedRequest, res: Response): Promise<void> {
    const parsed = parseDraft((req.body ?? {}).draft);
    if ('missing' in parsed) {
      res.status(400).json({ error: 'Missing or invalid required fields.', fields: parsed.missing });
      return;
    }
    await this.handleReviewErrors(res, async () => {
      const pantryId = await this.reviewService.approveSubmission(
        String(req.params.id),
        parsed.draft,
        req.user!.sub
      );
      res.json({ pantryId });
    });
  }

  public async rejectReviewItem(req: AuthedRequest, res: Response): Promise<void> {
    const reason = str((req.body ?? {}).reason);
    if (!reason) {
      res.status(400).json({ error: 'A rejection reason is required.' });
      return;
    }
    await this.handleReviewErrors(res, async () => {
      await this.reviewService.rejectItem(String(req.params.id), reason, req.user!.sub);
      res.json({ ok: true });
    });
  }

  public async deleteReviewItem(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      await this.mappingReviewService.deleteItem(String(req.params.id));
      res.json({ ok: true });
    });
  }

  public async listCrawlRuns(req: AuthedRequest, res: Response): Promise<void> {
    const limit = Number(req.query.limit ?? CRAWL_RUN_LIST_LIMIT);
    if (!Number.isInteger(limit) || limit < 1 || limit > CRAWL_RUN_LIST_LIMIT) {
      res.status(400).json({ error: `limit must be an integer from 1 to ${CRAWL_RUN_LIST_LIMIT}.` });
      return;
    }
    res.json({ runs: await this.crawlRunService.listRuns(limit) });
  }

  public async getCrawlRun(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleCrawlRunErrors(res, async () => {
      res.json(await this.crawlRunService.getRun(String(req.params.id)));
    });
  }

  public async startCrawlRun(req: AuthedRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const mode = body.mode as CrawlRunMode;
    if (mode !== 'dry-run' && mode !== 'apply') {
      res.status(400).json({ error: 'mode must be dry-run or apply.' });
      return;
    }
    const pantryId = str(body.pantryId, 100);
    const limit = body.limit ?? DEFAULT_CRAWL_LIMIT;
    if (!pantryId && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_CRAWL_LIMIT)) {
      res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_CRAWL_LIMIT}.` });
      return;
    }
    const llm = body.llm ?? DEFAULT_LLM_PROVIDER;
    if (!isLlmProvider(llm)) {
      res.status(400).json({ error: `llm must be one of ${LLM_PROVIDERS.join(', ')}.` });
      return;
    }
    const settingsError = body.settings === undefined ? null : llmSettingsError(llm, body.settings);
    if (settingsError) {
      res.status(400).json({ error: `settings: ${settingsError}` });
      return;
    }
    const settings = nonEmptySettings(body.settings as LlmSettings | undefined);
    await this.handleCrawlRunErrors(res, async () => {
      // Firestore rejects undefined fields.
      const options = pruneUndefined(
        pantryId ? { pantryId, limit: 1, llm, settings } : { limit: limit as number, llm, settings },
      );
      res.json(await this.crawlRunService.startRun(mode, options, req.user!.sub));
    });
  }

  public async abortCrawlRun(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleCrawlRunErrors(res, async () => {
      await this.crawlRunService.abortRun(String(req.params.id));
      res.json({ ok: true });
    });
  }

  public async getCrawlRunLog(req: AuthedRequest, res: Response): Promise<void> {
    const afterSeq = Number(req.query.afterSeq ?? 0);
    if (!Number.isInteger(afterSeq) || afterSeq < 0) {
      res.status(400).json({ error: 'afterSeq must be a non-negative integer.' });
      return;
    }
    res.json(await this.crawlRunService.getLog(String(req.params.id), afterSeq));
  }

  public async getMappingReview(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      res.json(await this.mappingReviewService.getMappingDetail(String(req.params.id)));
    });
  }

  public async confirmMapping(req: AuthedRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields = parseConfirmFields(body.fields);
    if (!fields) {
      res.status(400).json({ error: 'fields must be a list of { target, candidateIndex, value? }.' });
      return;
    }
    let address: AddressFields | undefined;
    if (body.address !== undefined && body.address !== null) {
      address = parseAddressFields(body.address as Record<string, unknown>);
      const missing = invalidAddressFields(address);
      if (missing.length) {
        res.status(400).json({ error: 'Missing or invalid required fields.', fields: missing });
        return;
      }
    }
    await this.handleReviewErrors(res, async () => {
      const applied = await this.mappingReviewService.confirmMapping(
        String(req.params.id),
        fields,
        address,
        req.user!.sub,
      );
      res.json({ applied });
    });
  }

  public async getSuspiciousReview(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      res.json(await this.mappingReviewService.getSuspiciousDetail(String(req.params.id)));
    });
  }

  public async approveValue(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      const id = String(req.params.id);
      const { target } = await this.mappingReviewService.getSuspiciousDetail(id);
      const value = parseTargetValue(target, (req.body ?? {}).value);
      if (value === null) {
        res.status(400).json({ error: 'value does not match the target field.' });
        return;
      }
      const applied = await this.mappingReviewService.approveValue(id, value, req.user!.sub);
      res.json({ applied });
    });
  }

  public async listChanges(req: AuthedRequest, res: Response): Promise<void> {
    res.json(
      await this.changeLogService.list({
        runId: str(req.query.runId, 100) || undefined,
        pantryId: str(req.query.pantryId, 100) || undefined,
        cursor: str(req.query.cursor, 100) || undefined,
      }),
    );
  }

  public async revertChange(req: AuthedRequest, res: Response): Promise<void> {
    await this.handlePantryWriteErrors(res, async () => {
      await this.changeLogService.revert(String(req.params.id), req.user!.sub);
      res.json({ ok: true });
    });
  }

  public async revertRun(req: AuthedRequest, res: Response): Promise<void> {
    res.json(await this.changeLogService.revertRun(String(req.params.id), req.user!.sub));
  }

  public async evictPantryCache(req: AuthedRequest, res: Response): Promise<void> {
    const found = await this.pantryCacheService.evict(String(req.params.id));
    if (!found) {
      res.status(404).json({ error: 'Pantry not found.' });
      return;
    }
    res.json({ ok: true });
  }

  public async getRedisStatus(_req: AuthedRequest, res: Response): Promise<void> {
    res.json(await this.redisStatusService.getStatus());
  }

  public async getRedisKeyStats(_req: AuthedRequest, res: Response): Promise<void> {
    res.json(await this.redisStatusService.getKeyStats());
  }

  public async getRedisEntry(req: AuthedRequest, res: Response): Promise<void> {
    const key = this.redisEntryKey(req, res);
    if (key) res.json(await this.redisStatusService.readEntry(key));
  }

  public async deleteRedisEntry(req: AuthedRequest, res: Response): Promise<void> {
    const key = this.redisEntryKey(req, res);
    if (key) res.json(await this.redisStatusService.deleteEntry(key));
  }

  /** Key from `?prefix=&key=`; responds with the error and returns null when invalid. */
  private redisEntryKey(req: AuthedRequest, res: Response): string | null {
    if (!this.redisStatusService.isEnabled()) {
      res.status(409).json({ error: 'Redis is not in use.' });
      return null;
    }
    const key = this.redisStatusService.resolveKey(req.query.prefix, req.query.key);
    if (!key) {
      res.status(400).json({ error: 'Unknown prefix or empty key.' });
    }
    return key;
  }

  public async getAppConfig(_req: AuthedRequest, res: Response): Promise<void> {
    res.json(await readAppConfig());
  }

  public async updateAppConfig(req: AuthedRequest, res: Response): Promise<void> {
    const parsed = parseAppConfig(req.body);
    if ('invalid' in parsed) {
      res.status(400).json({
        error: `Invalid settings: cache TTLs must be whole minutes from ${MIN_CACHE_TTL_MINUTES} to ${MAX_CACHE_TTL_MINUTES}.`,
        fields: parsed.invalid,
      });
      return;
    }
    res.json(await updateAppConfig(parsed.config, req.user!.sub));
  }

  public async listLlmEvals(_req: AuthedRequest, res: Response): Promise<void> {
    res.json({ evals: await this.llmEvalService.list() });
  }

  public async getLlmEval(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleReviewErrors(res, async () => {
      res.json(await this.llmEvalService.get(String(req.params.id)));
    });
  }

  public async gradeLlmEval(req: AuthedRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const variant = body.variant as EvalVariantKey;
    const grade = body.grade as EvalGrade;
    const target = body.target;
    if (
      (variant !== 'A' && variant !== 'B') ||
      !EVAL_GRADES.includes(grade) ||
      typeof target !== 'string' ||
      !isMappingTarget(target)
    ) {
      res.status(400).json({ error: 'Expected { variant: A|B, target, grade: correct|partial|wrong }.' });
      return;
    }
    await this.handleReviewErrors(res, async () => {
      await this.llmEvalService.grade(String(req.params.id), String(req.params.itemId), variant, target, grade);
      res.json({ ok: true });
    });
  }

  public async listLlmCompares(_req: AuthedRequest, res: Response): Promise<void> {
    res.json({ compares: await this.llmCompareService.list() });
  }

  public async getLlmCompare(req: AuthedRequest, res: Response): Promise<void> {
    await this.handleLlmCompareErrors(res, async () => {
      res.json(await this.llmCompareService.get(String(req.params.id)));
    });
  }

  public async startLlmCompare(req: AuthedRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const pantryId = str(body.pantryId, 100);
    // A slash would make it a path into another collection.
    if (!pantryId || pantryId.includes('/')) {
      res.status(400).json({ error: 'pantryId is required.' });
      return;
    }
    const raw = body.settings ?? {};
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      res.status(400).json({ error: 'settings must be an object.' });
      return;
    }
    const settings: Partial<Record<LlmProvider, LlmSettings>> = {};
    for (const [provider, value] of Object.entries(raw)) {
      if (!isLlmProvider(provider)) {
        res.status(400).json({ error: `settings: ${provider} is not an LLM.` });
        return;
      }
      const error = llmSettingsError(provider, value);
      if (error) {
        res.status(400).json({ error: `settings.${provider}: ${error}` });
        return;
      }
      const s = nonEmptySettings(value as LlmSettings);
      if (s) settings[provider] = s;
    }
    await this.handleLlmCompareErrors(res, async () => {
      res.json(await this.llmCompareService.start(pantryId, req.user!.sub, settings));
    });
  }

  private async handleLlmCompareErrors(res: Response, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof LlmCompareError) {
        const { status, error } = LLM_COMPARE_ERROR_STATUS[err.code];
        res.status(status).json({ error });
        return;
      }
      throw err;
    }
  }

  private async handlePantryWriteErrors(res: Response, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof PantryWriteError) {
        res.status(PANTRY_WRITE_ERROR_STATUS[err.code]).json({ error: err.message });
        return;
      }
      throw err;
    }
  }

  private async handleCrawlRunErrors(res: Response, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof CrawlRunError) {
        const { status, error } = CRAWL_RUN_ERROR_STATUS[err.code];
        res.status(status).json({ error });
        return;
      }
      throw err;
    }
  }

  private async handleReviewErrors(res: Response, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, error } = REVIEW_ERROR_STATUS[err.code];
        res.status(status).json({ error });
        return;
      }
      throw err;
    }
  }
}
