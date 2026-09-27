import { Response } from 'express';
import type {
  PantryDraft,
  ReviewItemStatus,
  ScheduleDraft,
  ServiceDraft,
} from '@pantry-finder/shared';
import { isValidStateSlug } from '@pantry-finder/shared';
import { AuthedRequest } from '../middleware/auth.middleware';
import { ReviewError, ReviewService } from '../services/review.service';
import { CrawlRunService } from '../services/crawl-run.service';
import { UserService } from '../services/user.service';
import { MAX_ABOUT, MAX_ARRAY, MAX_STR, str } from '../utils/validation.util';

const REVIEW_STATUSES: ReviewItemStatus[] = ['pending', 'approved', 'rejected'];

const REVIEW_ERROR_STATUS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Review item not found.' },
  wrong_type: { status: 400, error: 'This review item is not a user submission.' },
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

/** Validates an admin-edited draft; returns the missing/invalid field names on failure. */
function parseDraft(raw: unknown): { draft: PantryDraft } | { missing: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const draft: PantryDraft = {
    name: str(r.name),
    address1: str(r.address1),
    address2: str(r.address2, 200) || undefined,
    city: str(r.city),
    state: str(r.state, 100).toUpperCase(),
    zipCode: str(r.zipCode, 20),
    phone: str(r.phone, 40) || undefined,
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

  const missing: string[] = [];
  if (!draft.name) missing.push('name');
  if (!draft.address1) missing.push('address1');
  if (!draft.city) missing.push('city');
  if (!draft.state || !isValidStateSlug(draft.state.toLowerCase())) missing.push('state');
  if (!draft.zipCode) missing.push('zipCode');
  return missing.length ? { missing } : { draft };
}

export class AdminController {
  private readonly reviewService = new ReviewService();
  private readonly crawlRunService = new CrawlRunService();
  private readonly userService = new UserService();

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
    const items = await this.reviewService.listItems(status);
    res.json({ items });
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

  public async listCrawlRuns(_req: AuthedRequest, res: Response): Promise<void> {
    res.json({ runs: await this.crawlRunService.listRuns() });
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
