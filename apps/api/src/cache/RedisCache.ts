import type { Redis } from 'ioredis';
import { Cache } from './Cache';

/**
 * Redis-backed Cache. Values are JSON-serialized; a cached negative result is
 * the JSON string "null", while a missing key (Redis nil) is a miss. Every
 * operation fails open — a Redis outage degrades to cache misses, never to
 * request failures.
 */
export class RedisCache<T> implements Cache<T> {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly defaultTtlMs: number
  ) {}

  public async get(key: string): Promise<T | null | undefined> {
    try {
      const raw = await this.redis.get(this.prefix + key);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as T | null;
    } catch (err) {
      logCacheError('get', this.prefix, err);
      return undefined;
    }
  }

  public async set(key: string, value: T | null, ttlMs?: number): Promise<void> {
    try {
      await this.redis.set(
        this.prefix + key,
        JSON.stringify(value),
        'PX',
        ttlMs ?? this.defaultTtlMs
      );
    } catch (err) {
      logCacheError('set', this.prefix, err);
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefix + key);
    } catch (err) {
      logCacheError('delete', this.prefix, err);
    }
  }
}

function logCacheError(op: string, prefix: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Redis cache ${op} failed (${prefix}*):`, message);
}
