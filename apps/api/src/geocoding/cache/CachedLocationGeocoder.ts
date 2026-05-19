import { LRUCache } from "lru-cache";
import type { LocationGeocoder } from "../LocationGeocoder";
import type { Coordinates } from "../types";

const NULL_SENTINEL = Symbol("LOCATION_GEOCODE_NULL");
type CacheValue = Coordinates | typeof NULL_SENTINEL;

export class CachedLocationGeocoder implements LocationGeocoder {
  private readonly inner: LocationGeocoder;
  private readonly cache: LRUCache<string, CacheValue>;
  private readonly ttlMs: number = 24 * 60 * 60 * 1000;
  private readonly maxSize: number = 10000;
  private readonly cacheNullMs?: number;

  constructor(inner: LocationGeocoder) {
    this.inner = inner;

    this.cache = new LRUCache<string, CacheValue>({
      max: this.maxSize,
      ttl: this.ttlMs,
    });
  }

  public async geocode(location: string): Promise<Coordinates | null> {
    const key = normalizeKey(location);

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached === NULL_SENTINEL ? null : cached;
    }

    const result = await this.inner.geocode(location);

    if (result === null) {
      this.cache.set(key, NULL_SENTINEL, { ttl: this.cacheNullMs });
      return null;
    }

    this.cache.set(key, result, { ttl: this.ttlMs });
    return result;
  }
}

function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
