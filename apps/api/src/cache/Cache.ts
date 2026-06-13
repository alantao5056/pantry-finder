/**
 * Async cache abstraction backed by either Redis (prod, survives restarts) or
 * an in-process LRU (dev fallback when REDIS_URL is unset). See createCache().
 */
export interface Cache<T> {
  /** undefined = miss; null = cached negative result ("known missing"). */
  get(key: string): Promise<T | null | undefined>;
  set(key: string, value: T | null, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CacheOptions {
  /** Default TTL applied by set() when no per-call TTL is given. */
  ttlMs: number;
  /** Entry cap for the in-memory backend; the Redis backend relies on the
   * server-wide maxmemory/allkeys-lru policy instead. */
  max: number;
}
