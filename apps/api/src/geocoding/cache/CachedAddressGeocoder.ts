import { LRUCache } from "lru-cache";
import type { AddressGeocoder } from "../AddressGeocoder";
import type { Coordinates } from "../types";

const NULL_SENTINEL = Symbol("ADDRESS_GEOCODE_NULL");
type CacheValue = Coordinates | typeof NULL_SENTINEL;

export class CachedAddressGeocoder implements AddressGeocoder {
  private readonly inner: AddressGeocoder;
  private readonly cache: LRUCache<string, CacheValue>;
  private readonly ttlMs: number = 24 * 60 * 60 * 1000;
  private readonly maxSize: number = 10000;
  private readonly cacheNullMs?: number;

  constructor(inner: AddressGeocoder) {
    this.inner = inner;

    this.cache = new LRUCache<string, CacheValue>({
      max: this.maxSize,
      ttl: this.ttlMs,
    });
  }

  public async geocode(address: string): Promise<Coordinates | null> {
    const key = normalizeKey(address);

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

function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
