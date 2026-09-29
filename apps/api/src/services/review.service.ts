import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { GeoTransaction } from 'geofirestore';
import type {
  NearbyPantry,
  PantryDraft,
  ReviewItemStatus,
  ReviewItemSummary,
  SubmissionReviewDetail,
} from '@pantry-finder/shared';
import { isEmpty, stableStringify } from '@pantry-finder/shared';
import { db, geoFirestore } from '../config/firebase';
import { GeoService } from './geo.service';
import { ReviewItemDocument } from '../models/review-item.schema';
import { PantrySubmissionDocument } from '../models/pantry-submission.schema';
import { PantryChangeDocument } from '../models/pantry-change.schema';
import {
  FieldProvenance,
  FieldSource,
  PantryDocument,
  TrackedPantryField,
} from '../models/pantry.schema';
import { pruneUndefined } from '../utils/firestore.util';
import { invalidatePantryCaches } from '../cache/pantryCaches';
import { COLLECTIONS, mappingId, type FieldMappingDocument } from '@pantry-finder/shared/firestore';

// Existing pantries within this distance of a submission are flagged as
// possible duplicates.
const NEARBY_RADIUS_KM = 0.1;
const LIST_LIMIT = 100;

const TRACKED_FIELDS: TrackedPantryField[] = [
  'name', 'address1', 'address2', 'city', 'state', 'zipCode', 'phone',
  'website', 'aboutUs', 'contactName', 'notes', 'schedules', 'services',
];

export type ReviewErrorCode = 'not_found' | 'wrong_type' | 'not_pending' | 'geocode_failed' | 'invalid';

export class ReviewError extends Error {
  constructor(public readonly code: ReviewErrorCode) {
    super(code);
  }
}

function toIso(ts?: Timestamp): string | undefined {
  return ts ? ts.toDate().toISOString() : undefined;
}

export function toSummary(id: string, doc: ReviewItemDocument): ReviewItemSummary {
  return {
    id,
    type: doc.type,
    status: doc.status,
    title: doc.title,
    subtitle: doc.subtitle,
    createdAt: toIso(doc.createdAt)!,
    resolvedAt: toIso(doc.resolvedAt),
    resolvedBy: doc.resolvedBy,
  };
}

function submissionToDraft(s: PantrySubmissionDocument): PantryDraft {
  return {
    name: s.name,
    address1: s.address1,
    address2: s.address2,
    city: s.city,
    state: s.state ?? '',
    zipCode: s.zipCode ?? '',
    phone: s.phone,
    website: s.website,
    aboutUs: s.aboutUs,
    contactName: s.contactName,
    notes: s.notes,
    schedules: s.schedules ?? [],
    services: s.services ?? [],
  };
}

function oneLineAddress(d: Pick<PantryDraft, 'address1' | 'city' | 'state' | 'zipCode'>): string {
  return `${d.address1}, ${d.city}, ${d.state} ${d.zipCode}`;
}

export class ReviewService {
  private readonly reviewItemsCol = db.collection('review_items');
  private readonly submissionsCol = db.collection('pantry_submissions');
  private readonly changesCol = db.collection('pantry_changes');
  private readonly pantriesCol = db.collection('pantries');
  private readonly mappingsCol = db.collection(COLLECTIONS.fieldMappings);
  private readonly geoService = new GeoService();

  public async listItems(status: ReviewItemStatus): Promise<ReviewItemSummary[]> {
    const snapshot = await this.reviewItemsCol
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(LIST_LIMIT)
      .get();
    return snapshot.docs.map((d) => toSummary(d.id, d.data() as ReviewItemDocument));
  }

  public async getItem(id: string): Promise<ReviewItemSummary> {
    const snap = await this.reviewItemsCol.doc(id).get();
    if (!snap.exists) throw new ReviewError('not_found');
    return toSummary(snap.id, snap.data() as ReviewItemDocument);
  }

  public async getSubmissionDetail(id: string): Promise<SubmissionReviewDetail> {
    const itemSnap = await this.reviewItemsCol.doc(id).get();
    if (!itemSnap.exists) throw new ReviewError('not_found');
    const item = itemSnap.data() as ReviewItemDocument;
    if (item.type !== 'user_submission' || !item.submissionId) throw new ReviewError('wrong_type');

    const subSnap = await this.submissionsCol.doc(item.submissionId).get();
    if (!subSnap.exists) throw new ReviewError('not_found');
    const submission = subSnap.data() as PantrySubmissionDocument;
    const draft = submissionToDraft(submission);

    const location = await this.geoService.geocodeAddress(oneLineAddress(draft));
    const nearby = location ? await this.findNearby(location.latitude, location.longitude) : [];

    return {
      item: toSummary(itemSnap.id, item),
      submissionId: subSnap.id,
      submittedAt: toIso(submission.createdAt)!,
      submitter: {
        firstName: submission.submitterFirstName,
        lastName: submission.submitterLastName,
        email: submission.submitterEmail,
        relationship: submission.submitterRelationship,
        accountEmail: submission.submitterAccountEmail,
      },
      draft,
      location,
      nearby,
      pantryId: item.pantryId,
      rejectionReason: item.rejectionReason,
    };
  }

  /**
   * Creates a live pantry from a (possibly admin-edited) submission draft and
   * resolves the review item, atomically. Fields the admin changed from what
   * was submitted are attributed to 'admin' in `fieldSources`.
   * @returns The new pantry's id.
   */
  public async approveSubmission(id: string, draft: PantryDraft, adminEmail: string): Promise<string> {
    // Geocode outside the transaction: it's a slow external call, and a
    // transaction body can be retried.
    const location = await this.geoService.geocodeAddress(oneLineAddress(draft));
    if (!location) throw new ReviewError('geocode_failed');

    const itemRef = this.reviewItemsCol.doc(id);
    const pantryId = await db.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists) throw new ReviewError('not_found');
      const item = itemSnap.data() as ReviewItemDocument;
      if (item.type !== 'user_submission' || !item.submissionId) throw new ReviewError('wrong_type');
      if (item.status !== 'pending') throw new ReviewError('not_pending');

      const subRef = this.submissionsCol.doc(item.submissionId);
      const subSnap = await tx.get(subRef);
      if (!subSnap.exists) throw new ReviewError('not_found');
      const submitted = submissionToDraft(subSnap.data() as PantrySubmissionDocument);

      const now = Timestamp.now();
      const fieldSources: Partial<Record<TrackedPantryField, FieldProvenance>> = {};
      for (const field of TRACKED_FIELDS) {
        if (isEmpty(draft[field])) continue;
        const source: FieldSource =
          stableStringify(pruneUndefined(draft[field])) === stableStringify(pruneUndefined(submitted[field]))
            ? 'user_submission'
            : 'admin';
        fieldSources[field] = { source, at: now };
      }

      const pantry: Omit<PantryDocument, 'id'> = {
        name: draft.name,
        address1: draft.address1,
        address2: draft.address2 ?? '',
        city: draft.city,
        state: draft.state,
        zipCode: draft.zipCode,
        phone: draft.phone ?? '',
        coordinates: new GeoPoint(location.latitude, location.longitude),
        website: draft.website,
        aboutUs: draft.aboutUs,
        contactName: draft.contactName,
        notes: draft.notes,
        schedules: draft.schedules,
        services: draft.services.map((s) => ({
          ...s,
          foodProgramTypeDescription: s.foodProgramTypeDescription ?? '',
        })),
        source: 'user_submission',
        fieldSources,
        createdAt: now,
        updatedAt: now,
      };
      const pantryData = pruneUndefined(pantry);

      const pantryRef = this.pantriesCol.doc();
      // GeoTransaction adds the `g` geohash field that radius search relies on.
      new GeoTransaction(tx).set(pantryRef, pantryData);

      const change: PantryChangeDocument = {
        pantryId: pantryRef.id,
        kind: 'create',
        newValue: pantryData,
        source: 'user_submission',
        actor: adminEmail,
        reviewItemId: id,
        createdAt: now,
      };
      tx.create(this.changesCol.doc(), change);

      tx.update(itemRef, {
        status: 'approved',
        resolvedAt: now,
        resolvedBy: adminEmail,
        pantryId: pantryRef.id,
      });
      tx.update(subRef, {
        status: 'approved',
        reviewedAt: now,
        reviewedBy: adminEmail,
        pantryId: pantryRef.id,
      });

      return pantryRef.id;
    });
    // The new pantry belongs in its city's cached list.
    await invalidatePantryCaches({ id: pantryId, state: draft.state, city: draft.city });
    return pantryId;
  }

  public async rejectItem(id: string, reason: string, adminEmail: string): Promise<void> {
    const itemRef = this.reviewItemsCol.doc(id);
    await db.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists) throw new ReviewError('not_found');
      const item = itemSnap.data() as ReviewItemDocument;
      if (item.status !== 'pending') throw new ReviewError('not_pending');

      // A rejected mapping proposal frees its targets; the crawler proposes
      // again only once the site's content changes.
      const proposedRefs =
        item.type === 'new_mapping' && item.pantryId && item.newMapping
          ? item.newMapping.proposals.map((p) => this.mappingsCol.doc(mappingId(item.pantryId!, p.target)))
          : [];
      const proposedSnaps = proposedRefs.length ? await tx.getAll(...proposedRefs) : [];

      const now = Timestamp.now();
      for (const snap of proposedSnaps) {
        if (snap.exists && (snap.data() as FieldMappingDocument).status === 'proposed') tx.delete(snap.ref);
      }
      tx.update(itemRef, {
        status: 'rejected',
        resolvedAt: now,
        resolvedBy: adminEmail,
        rejectionReason: reason,
      });
      if (item.type === 'user_submission' && item.submissionId) {
        tx.update(this.submissionsCol.doc(item.submissionId), {
          status: 'rejected',
          reviewedAt: now,
          reviewedBy: adminEmail,
          rejectionReason: reason,
        });
      }
    });
  }

  private async findNearby(latitude: number, longitude: number): Promise<NearbyPantry[]> {
    const snapshot = await geoFirestore
      .collection('pantries')
      .near({ center: new GeoPoint(latitude, longitude), radius: NEARBY_RADIUS_KM })
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as unknown as PantryDocument;
        // GeoFirestore attaches `distance` (km) to each snapshot.
        const distanceKm = (doc as any).distance as number | undefined;
        return {
          id: doc.id,
          name: data.name,
          address: [data.address1, data.city, data.state, data.zipCode].filter(Boolean).join(', '),
          distanceMeters: Math.round((distanceKm ?? 0) * 1000),
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
}
