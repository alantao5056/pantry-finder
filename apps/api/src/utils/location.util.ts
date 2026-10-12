import type { GeoPoint } from 'firebase-admin/firestore';
import { encodeGeoDocument } from 'geofirestore-core';
import type { AddressFields } from '@pantry-finder/shared';
import type { GeoHashField } from '@pantry-finder/shared/firestore';

/** GeoFirestore's geohash index entry for a point, as its radius queries expect it. */
export function geoHashOf(point: GeoPoint): GeoHashField {
  return encodeGeoDocument(point, {}).g as unknown as GeoHashField;
}

/** Just the address fields, with `address2` as stored ('' when absent). */
export function addressFieldsOf(p: AddressFields): AddressFields {
  return { address1: p.address1, address2: p.address2 ?? '', city: p.city, state: p.state, zipCode: p.zipCode };
}
