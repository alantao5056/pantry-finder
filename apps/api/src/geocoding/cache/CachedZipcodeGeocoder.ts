import { LRUCache } from "lru-cache";
import type { ZipcodeGeocoder } from "../ZipcodeGeocoder";
import type { Coordinates } from "../types";

const NULL_SENTINEL = Symbol("ZIPCODE_GEOCODE_NULL");
type CacheValue = Coordinates | typeof NULL_SENTINEL;

export class CachedZipcodeGeocoder implements ZipcodeGeocoder {
  private readonly inner: ZipcodeGeocoder;
  private readonly cache: LRUCache<string, CacheValue>;
  private readonly ttlMs: number = 60 * 60 * 1000;
  private readonly maxSize: number = 10000;
  private readonly cacheNullMs?: number;

  constructor(inner: ZipcodeGeocoder) {
    this.inner = inner;

    this.cache = new LRUCache<string, CacheValue>({
      max: this.maxSize,
      ttl: this.ttlMs,
    });
  }

  public async geocode(zipcode: string): Promise<Coordinates | null> {
    const key = normalizeKey(zipcode);

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached === NULL_SENTINEL ? null : cached;
    }

    const result = await this.inner.geocode(zipcode);

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
