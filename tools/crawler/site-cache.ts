/**
 * Clears the API's Redis cache entries for pantries the crawler changed, so
 * the public site shows the new values right away instead of after the cache
 * TTL (24h for pantry pages, 48h for city pages). Same keys the API uses
 * (`pantryCacheKeys` in @pantry-finder/shared).
 *
 * Optional: without REDIS_URL the crawler still works and the site catches up
 * when the cache entries expire. Failures are logged, never fatal.
 */
import { Redis } from 'ioredis';
import { pantryCacheKeys } from '@pantry-finder/shared';
import type { PantryLocation } from '@pantry-finder/shared/firestore';
import type { Logger } from './logger.js';

export class SiteCache {
  private constructor(
    private redis: Redis | null,
    private readonly logger: Logger,
  ) {}

  /** For dry runs, which write nothing. */
  static disabled(logger: Logger): SiteCache {
    return new SiteCache(null, logger);
  }

  static fromEnv(logger: Logger): SiteCache {
    const url = process.env.REDIS_URL;
    if (!url) {
      logger.warn(
        'REDIS_URL not set: the API cache is not cleared after updates, so the site shows them ' +
          'only once cached entries expire (up to 24h for pantry pages, 48h for city pages).',
      );
      return new SiteCache(null, logger);
    }
    const redis = new Redis(url, {
      connectTimeout: 5000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    redis.on('error', (err) => logger.warn(`Redis: ${err.message}`));
    return new SiteCache(redis, logger);
  }

  /** Connects up front so a wrong REDIS_URL shows at the start of a run, not per pantry. */
  async check(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.ping();
      this.logger.info('Redis reachable: the API cache is cleared after each update.');
    } catch (err) {
      this.logger.warn(`WARNING: Redis unreachable (${(err as Error).message}); updates reach the site only after cache expiry.`);
      // Don't retry (and warn) for every updated pantry.
      this.redis.disconnect();
      this.redis = null;
    }
  }

  async invalidate(pantry: PantryLocation): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(...pantryCacheKeys(pantry));
    } catch (err) {
      this.logger.warn(`  ${pantry.id}: could not clear the API cache (${(err as Error).message})`);
    }
  }

  async close(): Promise<void> {
    if (!this.redis) return;
    if (this.redis.status === 'wait') {
      // Never connected (lazyConnect, nothing to clear).
      this.redis.disconnect();
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
