import { Cache, CacheOptions } from './Cache';
import { InMemoryCache } from './InMemoryCache';
import { RedisCache } from './RedisCache';
import { getRedisClient } from './redisClient';

let backendLogged = false;

/**
 * Creates a Cache for one key namespace: Redis-backed when REDIS_URL is set
 * (cache survives deploys/restarts), in-memory otherwise. `prefix` must be
 * unique per cache site (see the pf:* scheme used across the API).
 */
export function createCache<T>(prefix: string, options: CacheOptions): Cache<T> {
  const redis = getRedisClient();

  if (!backendLogged) {
    backendLogged = true;
    console.log(`Cache backend: ${redis ? 'redis' : 'in-memory'}`);
  }

  if (redis) {
    return new RedisCache<T>(redis, prefix, options.ttlMs);
  }
  return new InMemoryCache<T>(options);
}
