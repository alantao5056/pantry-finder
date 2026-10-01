import { createCache } from "../../cache/createCache";
import type { Cache } from "../../cache/Cache";
import { cacheTtl } from "../../services/app-config.service";
import type { ZipcodeGeocoder } from "../ZipcodeGeocoder";
import type { Coordinates } from "../types";

export class CachedZipcodeGeocoder implements ZipcodeGeocoder {
  private readonly inner: ZipcodeGeocoder;
  private readonly cache: Cache<Coordinates>;

  constructor(inner: ZipcodeGeocoder) {
    this.inner = inner;
    this.cache = createCache<Coordinates>("pf:geo:zip:", {
      ttlMs: cacheTtl.geocode,
      max: 10000,
    });
  }

  public async geocode(zipcode: string): Promise<Coordinates | null> {
    const key = normalizeKey(zipcode);

    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.inner.geocode(zipcode);
    // Failed lookups are cached too (as null) so they don't hit the provider.
    await this.cache.set(key, result);
    return result;
  }
}

function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
