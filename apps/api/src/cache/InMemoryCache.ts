import { LRUCache } from 'lru-cache';
import { Cache, CacheOptions } from './Cache';

/**
 * In-process fallback Cache used when REDIS_URL is unset (local dev). Values
 * are boxed as { v } because lru-cache cannot store null directly.
 */
export class InMemoryCache<T> implements Cache<T> {
  private readonly cache: LRUCache<string, { v: T | null }>;

  constructor(options: CacheOptions) {
    this.cache = new LRUCache<string, { v: T | null }>({
      max: options.max,
      ttl: options.ttlMs,
    });
  }

  public get(key: string): Promise<T | null | undefined> {
    const boxed = this.cache.get(key);
    return Promise.resolve(boxed === undefined ? undefined : boxed.v);
  }

  public set(key: string, value: T | null, ttlMs?: number): Promise<void> {
    this.cache.set(key, { v: value }, ttlMs !== undefined ? { ttl: ttlMs } : undefined);
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.cache.delete(key);
    return Promise.resolve();
  }
}
