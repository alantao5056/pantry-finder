import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import type {
  AdminPantryDetail,
  PantryDraft,
  UpdatePantryRequest,
  UpdatePantryResponse,
} from '@pantry-finder/shared';
import {
  COLLECTIONS,
  PantryWriteError,
  locationOf,
  planFieldUpdates,
  sameLocation,
  writeAddressUpdate,
  writeFieldUpdates,
  type FieldMappingDocument,
  type PantryLocation,
  type StoredLocation,
} from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';
import { PantryDocument } from '../models/pantry.schema';
import { invalidatePantryCaches } from '../cache/pantryCaches';
import { addressFieldsOf, geoHashOf } from '../utils/location.util';
import { GeoService } from './geo.service';
import { ReviewError, oneLineAddress } from './review.service';

type StoredPantry = Omit<PantryDocument, 'id'>;

function toDraft(p: StoredPantry): PantryDraft {
  return {
    name: p.name,
    address1: p.address1,
    address2: p.address2,
    city: p.city,
    state: p.state,
    zipCode: p.zipCode,
    phone: p.phone,
    email: p.email,
    website: p.website,
    aboutUs: p.aboutUs,
    contactName: p.contactName,
    notes: p.notes,
    schedules: p.schedules ?? [],
    services: (p.services ?? []).map((s) => ({
      name: s.name,
      categoryDescription: s.categoryDescription,
      foodProgramTypeDescription: s.foodProgramTypeDescription,
      foodOfferings: s.foodOfferings ?? [],
      notes: s.notes,
      schedules: s.schedules ?? [],
    })),
  };
}

/** Manual pantry edits from the admin; logged and revertible like crawler writes. */
export class PantryEditService {
  private readonly pantriesCol = db.collection(COLLECTIONS.pantries);
  private readonly mappingsCol = db.collection(COLLECTIONS.fieldMappings);
  private readonly geoService = new GeoService();

  /** @throws PantryWriteError */
  public async getDetail(id: string): Promise<AdminPantryDetail> {
    const [snap, mappingSnap] = await Promise.all([
      this.pantriesCol.doc(id).get(),
      this.mappingsCol.where('pantryId', '==', id).get(),
    ]);
    if (!snap.exists) throw new PantryWriteError('not_found', 'Pantry not found.');
    const pantry = snap.data() as StoredPantry;

    const fieldSources: AdminPantryDetail['fieldSources'] = {};
    for (const [field, p] of Object.entries(pantry.fieldSources ?? {})) {
      fieldSources[field] = { source: p.source, at: p.at.toDate().toISOString() };
    }
    return {
      id,
      pantry: toDraft(pantry),
      coordinates: { latitude: pantry.coordinates.latitude, longitude: pantry.coordinates.longitude },
      fieldSources,
      mappings: mappingSnap.docs.map((d) => {
        const m = d.data() as FieldMappingDocument;
        return { target: m.target, status: m.status, url: m.url };
      }),
      source: pantry.source,
      lastCrawledAt:
        pantry.lastCrawledAt === undefined ? undefined : (pantry.lastCrawledAt?.toDate().toISOString() ?? null),
      updatedAt: pantry.updatedAt?.toDate().toISOString(),
    };
  }

  /** @throws PantryWriteError | ReviewError('geocode_failed') */
  public async update(id: string, req: UpdatePantryRequest, adminEmail: string): Promise<UpdatePantryResponse> {
    const { address } = req;
    // Geocode outside the transaction, which can be retried.
    let coordinates: GeoPoint | undefined;
    if (address) {
      const point = await this.geoService.geocodeAddress(oneLineAddress(address));
      if (!point) throw new ReviewError('geocode_failed');
      coordinates = new GeoPoint(point.latitude, point.longitude);
    }

    const pantryRef = this.pantriesCol.doc(id);
    const { applied, addressChanged, location } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(pantryRef);
      if (!snap.exists) throw new PantryWriteError('not_found', 'Pantry not found.');
      const pantry = snap.data() as StoredPantry;
      if (pantry.updatedAt?.toDate().toISOString() !== req.baseUpdatedAt) {
        throw new PantryWriteError('conflict', 'The pantry has changed since you opened it. Reload and try again.');
      }

      const ctx = { source: 'admin' as const, actor: adminEmail, now: Timestamp.now() };
      const plan = planFieldUpdates(pantry, req.fields);
      writeFieldUpdates(tx, db, pantryRef, pantry, plan, ctx);

      let location: PantryLocation = { id, state: pantry.state, city: pantry.city };
      let addressChanged = false;
      if (address && coordinates) {
        const previous = locationOf(pantry, pantry.g ?? geoHashOf(pantry.coordinates));
        const next: StoredLocation = { ...addressFieldsOf(address), coordinates, g: geoHashOf(coordinates) };
        if (!sameLocation(previous, next)) {
          writeAddressUpdate(tx, db, pantryRef, previous, next, ctx);
          location = { ...location, state: next.state, city: next.city, movedFrom: { state: pantry.state, city: pantry.city } };
          addressChanged = true;
        }
      }
      return { applied: plan.length + (addressChanged ? 1 : 0), addressChanged, location };
    });
    if (applied) await invalidatePantryCaches(location);
    return { applied, addressChanged };
  }
}
