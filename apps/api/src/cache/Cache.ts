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

/** A fixed TTL, or one looked up on every write (runtime-configurable TTLs). */
export type CacheTtl = number | (() => Promise<number>);

export function resolveTtl(ttl: CacheTtl): Promise<number> {
  return typeof ttl === 'number' ? Promise.resolve(ttl) : ttl();
}

export interface CacheOptions {
  /** Default TTL applied by set() when no per-call TTL is given. */
  ttlMs: CacheTtl;
  /** Entry cap for the in-memory backend; the Redis backend relies on the
   * server-wide maxmemory/allkeys-lru policy instead. */
  max: number;
}
