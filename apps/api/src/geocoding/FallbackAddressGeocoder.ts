import type { AddressGeocoder } from "./AddressGeocoder";
import type { Coordinates } from "./types";

/**
 * Tries each geocoder in order until one finds the address. A provider that
 * errors counts as a miss; the last error is rethrown only if none matched.
 */
export class FallbackAddressGeocoder implements AddressGeocoder {
  constructor(private readonly geocoders: AddressGeocoder[]) {}

  public async geocode(address: string): Promise<Coordinates | null> {
    let lastError: unknown;
    for (const geocoder of this.geocoders) {
      try {
        const result = await geocoder.geocode(address);
        if (result) return result;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return null;
  }
}
