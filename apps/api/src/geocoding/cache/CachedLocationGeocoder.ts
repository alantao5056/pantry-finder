import { createCache } from "../../cache/createCache";
import type { Cache } from "../../cache/Cache";
import { cacheTtl } from "../../services/app-config.service";
import type { LocationGeocoder } from "../LocationGeocoder";
import type { Coordinates } from "../types";

export class CachedLocationGeocoder implements LocationGeocoder {
  private readonly inner: LocationGeocoder;
  private readonly cache: Cache<Coordinates>;

  constructor(inner: LocationGeocoder) {
    this.inner = inner;
    this.cache = createCache<Coordinates>("pf:geo:loc:", {
      ttlMs: cacheTtl.geocode,
      max: 10000,
    });
  }

  public async geocode(location: string): Promise<Coordinates | null> {
    const key = normalizeKey(location);

    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.inner.geocode(location);
    // Failed lookups are cached too (as null) so they don't hit the provider.
    await this.cache.set(key, result);
    return result;
  }
}

function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
