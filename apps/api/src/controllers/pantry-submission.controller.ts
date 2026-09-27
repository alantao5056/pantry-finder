import { Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { isValidStateSlug } from '@pantry-finder/shared';
import { AuthedRequest } from '../middleware/auth.middleware';
import { SubmitPantryRequestDto } from '../models/dto/pantry-submission.request.dto';
import {
  PantrySubmissionDocument,
  SubmissionScheduleSchema,
  SubmissionServiceSchema,
} from '../models/pantry-submission.schema';
import { PantrySubmissionService } from '../services/pantry-submission.service';
import { MAX_ABOUT, MAX_ARRAY, MAX_STR, str } from '../utils/validation.util';

const submissionService = new PantrySubmissionService();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Narrow + trim a single schedule row; returns null for fully-empty rows. */
function parseSchedule(raw: unknown): SubmissionScheduleSchema | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const weekDay = str(r.weekDay, 20);
  const startTime = str(r.start, 20);
  const endTime = str(r.end, 20);
  const notes = str(r.notes, 200);
  const everyOtherWeek = r.everyOtherWeek === true;

  // Day, open, and close times are all required; drop any incomplete row
  // (covers both empty rows and partially-filled ones).
  if (!weekDay || !startTime || !endTime) return null;

  return {
    weekDay,
    startTime,
    endTime,
    notes: notes || undefined,
    everyOtherWeekIndicator: everyOtherWeek || undefined,
  };
}

function parseSchedules(raw: unknown): SubmissionScheduleSchema[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseSchedule)
    .filter((s): s is SubmissionScheduleSchema => s !== null)
    .slice(0, MAX_ARRAY);
}

/** Narrow + trim a single service (with its nested schedules); null if unnamed. */
function parseService(raw: unknown): SubmissionServiceSchema | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name, 100);
  if (!name) return null;

  const foodOfferings = Array.isArray(r.foods)
    ? r.foods.map((f) => str(f, 100)).filter(Boolean).slice(0, MAX_ARRAY)
    : [];

  return {
    name,
    categoryDescription: str(r.category, 100),
    foodProgramTypeDescription: str(r.program, 100) || undefined,
    foodOfferings,
    notes: str(r.notes, MAX_STR) || undefined,
    schedules: parseSchedules(r.schedules),
  };
}

export class PantrySubmissionController {
  public async submit(
    req: AuthedRequest,
    res: Response
  ): Promise<void> {
    const body = (req.body ?? {}) as SubmitPantryRequestDto;

    // Required pantry fields.
    const name = str(body.name);
    const address1 = str(body.street);
    const city = str(body.city);
    // Normalize to the 2-letter code convention used across the app (e.g. "MA").
    const state = str(body.state, 100).toUpperCase();
    const zipCode = str(body.zipCode, 20);

    // Required submitter fields.
    const submitterFirstName = str(body.firstName);
    const submitterLastName = str(body.lastName);
    const submitterEmail = str(body.email, 200);
    const submitterRelationship = str(body.relationship);

    const missing: string[] = [];
    if (!name) missing.push('name');
    if (!address1) missing.push('street');
    if (!city) missing.push('city');
    // Must be a real US state code (isValidStateSlug expects the lowercase slug).
    if (!state || !isValidStateSlug(state.toLowerCase())) missing.push('state');
    if (!zipCode) missing.push('zipCode');
    if (!submitterFirstName) missing.push('firstName');
    if (!submitterLastName) missing.push('lastName');
    if (!submitterRelationship) missing.push('relationship');
    if (!submitterEmail || !EMAIL_RE.test(submitterEmail)) missing.push('email');

    if (missing.length > 0) {
      res.status(400).json({
        error: 'Missing or invalid required fields.',
        fields: missing,
      });
      return;
    }

    const schedules = parseSchedules(body.schedules);
    const services: SubmissionServiceSchema[] = Array.isArray(body.services)
      ? body.services
          .map(parseService)
          .filter((s): s is SubmissionServiceSchema => s !== null)
          .slice(0, MAX_ARRAY)
      : [];

    const submission: PantrySubmissionDocument = {
      name,
      address1,
      address2: str(body.address2, 200) || undefined,
      city,
      state,
      zipCode,
      phone: str(body.phone, 40) || undefined,
      website: str(body.website, 300) || undefined,
      aboutUs: str(body.about, MAX_ABOUT) || undefined,
      contactName: str(body.contactName, 200) || undefined,
      notes: str(body.notes, MAX_ABOUT) || undefined,
      schedules,
      services,
      submitterFirstName,
      submitterLastName,
      submitterEmail,
      submitterRelationship,
      submitterAccountEmail: req.user?.sub,
      status: 'pending',
      createdAt: Timestamp.now(),
    };

    try {
      const id = await submissionService.createSubmission(submission);
      res.status(201).json({ ok: true, id });
    } catch (error) {
      console.error('Error saving pantry submission:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
}
