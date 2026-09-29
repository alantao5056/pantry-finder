import { createCache } from "../../cache/createCache";
import type { Cache } from "../../cache/Cache";
import type { AddressGeocoder } from "../AddressGeocoder";
import type { Coordinates } from "../types";

export class CachedAddressGeocoder implements AddressGeocoder {
  private readonly inner: AddressGeocoder;
  private readonly cache: Cache<Coordinates>;

  constructor(inner: AddressGeocoder) {
    this.inner = inner;
    // v2: Geocodio fallback added — drops nulls cached by the Census-only lookup.
    this.cache = createCache<Coordinates>("pf:geo:addr:v2:", {
      ttlMs: 24 * 60 * 60 * 1000,
      max: 10000,
    });
  }

  public async geocode(address: string): Promise<Coordinates | null> {
    const key = normalizeKey(address);

    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.inner.geocode(address);
    // Failed lookups are cached too (as null) so they don't hit the provider.
    await this.cache.set(key, result);
    return result;
  }
}

function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
