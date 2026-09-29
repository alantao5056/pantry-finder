import { FieldValue, GeoPoint, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { encodeGeoDocument } from 'geofirestore-core';
import type {
  AddressFields,
  ConfirmMappingField,
  MappingReviewDetail,
  SuspiciousReviewDetail,
  TargetValue,
} from '@pantry-finder/shared';
import { normalizeTargetValue, parseTarget, sameTargetValue } from '@pantry-finder/shared';
import {
  COLLECTIONS,
  getTargetValue,
  locationOf,
  mappingId,
  planFieldUpdates,
  rawHash,
  sameLocation,
  sourceId,
  writeAddressUpdate,
  writeFieldUpdates,
  type ExtractionCacheDocument,
  type FieldMappingDocument,
  type FieldUpdate,
  type GeoHashField,
  type PantryLocation,
  type StoredLocation,
} from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';
import { PantryDocument } from '../models/pantry.schema';
import { ReviewItemDocument } from '../models/review-item.schema';
import { ReviewError, oneLineAddress, toSummary } from './review.service';
import { GeoService } from './geo.service';
import { invalidatePantryCaches } from '../cache/pantryCaches';

type StoredPantry = Omit<PantryDocument, 'id'>;

/** GeoFirestore's geohash index entry for a point, as its radius queries expect it. */
function geoHashOf(point: GeoPoint): GeoHashField {
  return encodeGeoDocument(point, {}).g as unknown as GeoHashField;
}

function addressFieldsOf(p: AddressFields): AddressFields {
  return { address1: p.address1, address2: p.address2 ?? '', city: p.city, state: p.state, zipCode: p.zipCode };
}

function emptyValue(target: string): TargetValue {
  return parseTarget(target)?.kind === 'schedules' ? [] : '';
}

function kindOf(target: string): 'text' | 'schedules' {
  return parseTarget(target)?.kind === 'schedules' ? 'schedules' : 'text';
}

/**
 * Review of crawler findings: first-visit mapping proposals (`new_mapping`) and
 * values held back by the guardrails (`suspicious_value`). Approving writes the
 * live pantry immediately, with change-log entries, and remembers the decision
 * (field mapping + extraction cache) so the same question isn't asked again.
 */
export class MappingReviewService {
  private readonly reviewItemsCol = db.collection(COLLECTIONS.reviewItems);
  private readonly pantriesCol = db.collection(COLLECTIONS.pantries);
  private readonly mappingsCol = db.collection(COLLECTIONS.fieldMappings);
  private readonly cacheCol = db.collection(COLLECTIONS.extractionCache);
  private readonly sourcesCol = db.collection(COLLECTIONS.crawlSources);
  private readonly geoService = new GeoService();

  public async getMappingDetail(id: string): Promise<MappingReviewDetail> {
    const { item, pantry } = await this.load(id, 'new_mapping');
    const payload = item.newMapping!;
    return {
      item: toSummary(id, item),
      pantryId: item.pantryId!,
      pantryName: pantry.name,
      website: payload.website,
      fetchedAt: payload.fetchedAt.toDate().toISOString(),
      storedAddress: oneLineAddress(pantry),
      addressCheck: payload.addressCheck,
      confirmedAddress: payload.confirmedAddress,
      storedPhone: pantry.phone || undefined,
      phoneCheck: payload.phoneCheck,
      serviceNames: (pantry.services ?? []).map((s) => s.name),
      fields: payload.proposals.map((p) => ({
        target: p.target,
        currentValue: getTargetValue(pantry, p.target) ?? emptyValue(p.target),
        candidates: p.candidates,
        confirmedCandidate: payload.confirmed?.[p.target],
      })),
      rejectionReason: item.rejectionReason,
    };
  }

  /**
   * Resolves a mapping proposal: picked candidates become active mappings and
   * their values are applied; targets left out or set to null are rejected
   * (not proposed again). `address`, when given, moves the pantry there
   * (re-geocoded; address and coordinates change together).
   * @returns Number of pantry changes made.
   */
  public async confirmMapping(
    id: string,
    fields: ConfirmMappingField[],
    address: AddressFields | undefined,
    adminEmail: string,
  ): Promise<number> {
    // Geocode outside the transaction: it's a slow external call, and a
    // transaction body can be retried.
    let coordinates: GeoPoint | undefined;
    if (address) {
      const point = await this.geoService.geocodeAddress(oneLineAddress(address));
      if (!point) throw new ReviewError('geocode_failed');
      coordinates = new GeoPoint(point.latitude, point.longitude);
    }

    const itemRef = this.reviewItemsCol.doc(id);
    const { applied, location } = await db.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      const item = this.check(itemSnap.exists ? (itemSnap.data() as ReviewItemDocument) : undefined, 'new_mapping');
      const pantryRef = this.pantriesCol.doc(item.pantryId!);
      const pantrySnap = await tx.get(pantryRef);
      if (!pantrySnap.exists) throw new ReviewError('not_found');
      const pantry = pantrySnap.data() as StoredPantry;

      const now = Timestamp.now();
      const byTarget = new Map(fields.map((f) => [f.target, f]));
      const updates: FieldUpdate[] = [];
      const confirmed: Record<string, number | null> = {};

      for (const proposal of item.newMapping!.proposals) {
        const choice = byTarget.get(proposal.target);
        const index = choice?.candidateIndex ?? null;
        const ref = this.mappingsCol.doc(mappingId(item.pantryId!, proposal.target));
        confirmed[proposal.target] = index;

        if (index === null) {
          const rejected: FieldMappingDocument = {
            pantryId: item.pantryId!,
            target: proposal.target,
            status: 'rejected',
            reviewItemId: id,
            confirmedBy: adminEmail,
            confirmedAt: now,
            updatedAt: now,
          };
          tx.set(ref, rejected);
          continue;
        }

        const candidate = proposal.candidates[index];
        if (!candidate) throw new ReviewError('invalid');
        const value = normalizeTargetValue(proposal.target, choice?.value ?? candidate.value);
        const hash = rawHash(kindOf(proposal.target), candidate.rawText);
        const mapping: FieldMappingDocument = {
          pantryId: item.pantryId!,
          target: proposal.target,
          status: 'active',
          reviewItemId: id,
          url: candidate.url,
          selector: candidate.selector,
          ...(candidate.textAnchor ? { textAnchor: candidate.textAnchor } : {}),
          lastRawHash: hash,
          confirmedBy: adminEmail,
          confirmedAt: now,
          updatedAt: now,
        };
        tx.set(ref, mapping);
        const cache: ExtractionCacheDocument = {
          kind: kindOf(proposal.target),
          value,
          confirmedBy: adminEmail,
          confirmedAt: now,
        };
        tx.set(this.cacheCol.doc(hash), cache);
        updates.push({
          target: proposal.target,
          value,
          mappingId: ref.id,
          source: sameTargetValue(proposal.target, value, candidate.value) ? 'crawler' : 'admin',
        });
      }

      const ctx = { source: 'crawler' as const, actor: adminEmail, now, reviewItemId: id, runId: item.runId };
      const plan = planFieldUpdates(pantry, updates);
      writeFieldUpdates(tx, db, pantryRef, pantry, plan, ctx);

      let location: PantryLocation = { id: pantryRef.id, state: pantry.state, city: pantry.city };
      let moved = false;
      if (address && coordinates) {
        const previous = locationOf(pantry, pantry.g ?? geoHashOf(pantry.coordinates));
        const next: StoredLocation = { ...addressFieldsOf(address), coordinates, g: geoHashOf(coordinates) };
        if (!sameLocation(previous, next)) {
          writeAddressUpdate(tx, db, pantryRef, previous, next, { ...ctx, source: 'admin' });
          location = { ...location, state: next.state, city: next.city, movedFrom: { state: pantry.state, city: pantry.city } };
          moved = true;
        }
      }

      tx.update(itemRef, {
        status: 'approved',
        resolvedAt: now,
        resolvedBy: adminEmail,
        'newMapping.confirmed': confirmed,
        'newMapping.confirmedAddress': moved ? addressFieldsOf(address!) : null,
      });
      return { applied: plan.length + (moved ? 1 : 0), location };
    });
    if (applied) await invalidatePantryCaches(location);
    return applied;
  }

  public async getSuspiciousDetail(id: string): Promise<SuspiciousReviewDetail> {
    const { item, pantry } = await this.load(id, 'suspicious_value');
    const s = item.suspicious!;
    return {
      item: toSummary(id, item),
      pantryId: item.pantryId!,
      pantryName: pantry.name,
      target: s.target,
      url: s.url,
      rawText: s.rawText,
      reasons: s.reasons,
      currentValue: getTargetValue(pantry, s.target) ?? emptyValue(s.target),
      proposedValue: s.newValue,
      serviceNames: (pantry.services ?? []).map((sv) => sv.name),
      rejectionReason: item.rejectionReason,
    };
  }

  /**
   * Applies a held-back value (possibly edited). Its mapping goes back to
   * `active`, and the confirmed parse is cached for that region text.
   * @returns Number of pantry fields that changed (0 or 1).
   */
  public async approveValue(id: string, value: TargetValue, adminEmail: string): Promise<number> {
    const itemRef = this.reviewItemsCol.doc(id);
    const { applied, location } = await db.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      const item = this.check(itemSnap.exists ? (itemSnap.data() as ReviewItemDocument) : undefined, 'suspicious_value');
      const s = item.suspicious!;
      const pantryRef = this.pantriesCol.doc(item.pantryId!);
      const pantrySnap = await tx.get(pantryRef);
      if (!pantrySnap.exists) throw new ReviewError('not_found');
      const pantry = pantrySnap.data() as StoredPantry;
      const mappingRef = s.mappingId ? this.mappingsCol.doc(s.mappingId) : null;
      const mappingSnap = mappingRef ? await tx.get(mappingRef) : null;

      const now = Timestamp.now();
      const normalized = normalizeTargetValue(s.target, value);
      const plan = planFieldUpdates(pantry, [
        {
          target: s.target,
          value: normalized,
          mappingId: s.mappingId,
          source: sameTargetValue(s.target, normalized, s.newValue) ? 'crawler' : 'admin',
        },
      ]);
      writeFieldUpdates(tx, db, pantryRef, pantry, plan, {
        source: 'crawler',
        actor: adminEmail,
        now,
        reviewItemId: id,
        runId: item.runId,
      });
      if (mappingRef && mappingSnap?.exists) {
        tx.update(mappingRef, { status: 'active', confirmedBy: adminEmail, confirmedAt: now, updatedAt: now });
      }
      if (s.rawHash) {
        const cache: ExtractionCacheDocument = {
          kind: kindOf(s.target),
          value: normalized,
          confirmedBy: adminEmail,
          confirmedAt: now,
        };
        tx.set(this.cacheCol.doc(s.rawHash), cache);
      }
      tx.update(itemRef, { status: 'approved', resolvedAt: now, resolvedBy: adminEmail });
      return { applied: plan.length, location: { id: pantryRef.id, state: pantry.state, city: pantry.city } };
    });
    if (applied) await invalidatePantryCaches(location);
    return applied;
  }

  /**
   * Deletes a pending crawler review and clears what the crawler remembers
   * about it (proposed mappings, proposal/redirect markers, the held-back
   * text's hash), so the next run handles the pantry afresh. The pantry's
   * `lastCrawledAt` is cleared too, which puts it first in the rotation.
   */
  public async deleteItem(id: string): Promise<void> {
    const itemRef = this.reviewItemsCol.doc(id);
    await db.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists) throw new ReviewError('not_found');
      const item = itemSnap.data() as ReviewItemDocument;
      if (item.type !== 'new_mapping' && item.type !== 'suspicious_value') throw new ReviewError('wrong_type');
      const pantryId = this.check(item, item.type).pantryId!;

      // Reads first: a transaction may not read after writing.
      const pantryRef = this.pantriesCol.doc(pantryId);
      const pantrySnap = await tx.get(pantryRef);
      const clears: { ref: DocumentReference; field: string }[] = [];
      const deletes: DocumentReference[] = [];

      if (item.type === 'new_mapping') {
        const m = item.newMapping!;
        const refs = m.proposals.map((p) => this.mappingsCol.doc(mappingId(pantryId, p.target)));
        const snaps = refs.length ? await tx.getAll(...refs) : [];
        for (const snap of snaps) {
          const mapping = snap.data() as FieldMappingDocument | undefined;
          if (mapping?.status === 'proposed' && mapping.reviewItemId === id) deletes.push(snap.ref);
        }
        const sourceSnap = await tx.get(this.sourcesCol.doc(sourceId(m.website)));
        if (sourceSnap.get('proposalHash') !== undefined) clears.push({ ref: sourceSnap.ref, field: 'proposalHash' });
      } else {
        const s = item.suspicious!;
        if (s.target === 'website') {
          const sourceSnap = await tx.get(this.sourcesCol.doc(sourceId(s.url)));
          if (sourceSnap.get('redirectReviewedUrl') === s.newValue) {
            clears.push({ ref: sourceSnap.ref, field: 'redirectReviewedUrl' });
          }
        } else if (s.mappingId && s.rawHash) {
          const mappingSnap = await tx.get(this.mappingsCol.doc(s.mappingId));
          if ((mappingSnap.data() as FieldMappingDocument | undefined)?.lastRawHash === s.rawHash) {
            clears.push({ ref: mappingSnap.ref, field: 'lastRawHash' });
          }
        }
      }

      for (const ref of deletes) tx.delete(ref);
      for (const { ref, field } of clears) tx.update(ref, { [field]: FieldValue.delete() });
      if (pantrySnap.exists) tx.update(pantryRef, { lastCrawledAt: FieldValue.delete() });
      tx.delete(itemRef);
    });
  }

  private async load(
    id: string,
    type: 'new_mapping' | 'suspicious_value',
  ): Promise<{ item: ReviewItemDocument; pantry: StoredPantry }> {
    const snap = await this.reviewItemsCol.doc(id).get();
    if (!snap.exists) throw new ReviewError('not_found');
    const item = snap.data() as ReviewItemDocument;
    if (item.type !== type || !item.pantryId) throw new ReviewError('wrong_type');
    const pantrySnap = await this.pantriesCol.doc(item.pantryId).get();
    if (!pantrySnap.exists) throw new ReviewError('not_found');
    return { item, pantry: pantrySnap.data() as StoredPantry };
  }

  private check(item: ReviewItemDocument | undefined, type: 'new_mapping' | 'suspicious_value'): ReviewItemDocument {
    if (!item) throw new ReviewError('not_found');
    const payload = type === 'new_mapping' ? item.newMapping : item.suspicious;
    if (item.type !== type || !item.pantryId || !payload) throw new ReviewError('wrong_type');
    if (item.status !== 'pending') throw new ReviewError('not_pending');
    return item;
  }
}
