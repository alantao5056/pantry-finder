import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';
import { getRedisClient } from './redisClient';

export interface RateLimitResult {
  allowed: boolean;
  /** Only meaningful when allowed is false: ms until the oldest hit expires. */
  retryAfterMs: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export const KEY_PREFIX = 'pf:rl:';

// Atomic sliding-window check-and-add over a sorted set of hit timestamps:
// drop entries older than the window, deny (returning the oldest score so the
// caller can compute Retry-After) when at the limit, otherwise record the hit
// and refresh the key's expiry.
const CONSUME_LUA = `
local cutoff = tonumber(ARGV[1]) - tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, oldest[2]}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return {1, '0'}
`;

// ioredis has no typings for commands added via defineCommand.
type RedisWithConsume = Redis & {
  rlConsume(key: string, now: number, windowMs: number, limit: number, member: string): Promise<[number, string]>;
};

class RedisRateLimiter implements RateLimiter {
  private readonly redis: RedisWithConsume;

  constructor(redis: Redis) {
    redis.defineCommand('rlConsume', { numberOfKeys: 1, lua: CONSUME_LUA });
    this.redis = redis as RedisWithConsume;
  }

  public async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    try {
      // Unique member so two hits in the same millisecond both count.
      const member = `${now}:${randomUUID()}`;
      const [allowed, oldestScore] = await this.redis.rlConsume(
        KEY_PREFIX + key,
        now,
        windowMs,
        limit,
        member
      );
      if (allowed === 1) {
        return { allowed: true, retryAfterMs: 0 };
      }
      const oldest = Number(oldestScore) || now;
      return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
    } catch (err) {
      // Fail open: the limits protect upstream API quota, not security, so
      // availability wins when Redis is down.
      const message = err instanceof Error ? err.message : String(err);
      console.error('Redis rate limiter failed, allowing request:', message);
      return { allowed: true, retryAfterMs: 0 };
    }
  }
}

class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new LRUCache<string, number[]>({ max: 50_000 });

  public consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const existing = this.buckets.get(key) ?? [];
    const recent = existing.filter((t) => t > cutoff);

    if (recent.length >= limit) {
      const oldest = recent[0] ?? now;
      return Promise.resolve({
        allowed: false,
        retryAfterMs: Math.max(0, oldest + windowMs - now),
      });
    }

    recent.push(now);
    this.buckets.set(key, recent, { ttl: windowMs });
    return Promise.resolve({ allowed: true, retryAfterMs: 0 });
  }
}

/** Redis-backed when REDIS_URL is set (limits survive deploys), else in-memory. */
export function createRateLimiter(): RateLimiter {
  const redis = getRedisClient();
  return redis ? new RedisRateLimiter(redis) : new InMemoryRateLimiter();
}
