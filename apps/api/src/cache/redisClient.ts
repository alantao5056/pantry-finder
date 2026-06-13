import { Redis } from 'ioredis';

// Singleton Redis connection, created lazily so REDIS_URL is read after
// config/env has loaded (controllers instantiate services at module level,
// which can run before index.ts finishes its imports).
let client: Redis | null = null;
let initialized = false;

/**
 * Returns the shared Redis client, or null when REDIS_URL is unset (dev
 * default) — callers fall back to in-memory caches in that case.
 */
export function getRedisClient(): Redis | null {
  if (initialized) {
    return client;
  }
  initialized = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  client = new Redis(url, {
    connectTimeout: 2000,
    // Fail fast instead of stalling requests: commands reject immediately
    // while disconnected, and a hung server can't hold a request past 1s.
    commandTimeout: 1000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    // Reconnect forever with capped backoff; the API fail-opens meanwhile.
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  // Without an 'error' listener an unreachable Redis crashes the process
  // (unhandled 'error' event). Errors here are expected during outages.
  client.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });

  return client;
}

/** Closes the Redis connection on shutdown. No-op when Redis is disabled. */
export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
  }
}
