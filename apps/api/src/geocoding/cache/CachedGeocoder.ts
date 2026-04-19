import { LRUCache } from "lru-cache";
import type { Geocoder } from "../Geocoder";
import type { Coordinates } from "../types";

const NULL_SENTINEL = Symbol("GEOCODE_NULL");
type CacheValue = Coordinates | typeof NULL_SENTINEL;

export class CachedGeocoder implements Geocoder {
  private readonly inner: Geocoder;
  private readonly cache: LRUCache<string, CacheValue>;
  private readonly ttlMs: number = 60 * 60 * 1000; // default 1 hour
  private readonly maxSize: number = 10000; // default max size
  private readonly cacheNullMs?: number;

  constructor(inner: Geocoder) {
    this.inner = inner;

    this.cache = new LRUCache<string, CacheValue>({
      max: this.maxSize,
      ttl: this.ttlMs,
    });
  }

  public async geocode(address: string): Promise<Coordinates | null> {
    const key = normalizeAddressKey(address);

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached === NULL_SENTINEL ? null : cached;
    }

    const result = await this.inner.geocode(address);

    if (result === null) {
      this.cache.set(key, NULL_SENTINEL, { ttl: this.cacheNullMs });      
      return null;
    }

    this.cache.set(key, result, { ttl: this.ttlMs });
    return result;
  }
}

function normalizeAddressKey(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}
