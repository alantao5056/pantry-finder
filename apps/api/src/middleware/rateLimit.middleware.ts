import { Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';
import { AuthedRequest } from './auth.middleware';
import {
  ANON_SEARCH_LIMIT,
  ANON_SEARCH_WINDOW_MS,
  USER_SEARCH_LIMIT,
  USER_SEARCH_WINDOW_MS,
} from '../config/constants';

const userBuckets = new LRUCache<string, number[]>({
  max: 10_000,
  ttl: USER_SEARCH_WINDOW_MS,
});

const ipBuckets = new LRUCache<string, number[]>({
  max: 50_000,
  ttl: ANON_SEARCH_WINDOW_MS,
});

type Bucket = {
  cache: LRUCache<string, number[]>;
  key: string;
  limit: number;
  windowMs: number;
  requiresAuth: boolean;
};

function selectBucket(req: AuthedRequest): Bucket | null {
  if (req.user?.sub) {
    return {
      cache: userBuckets,
      key: `user:${req.user.sub}`,
      limit: USER_SEARCH_LIMIT,
      windowMs: USER_SEARCH_WINDOW_MS,
      requiresAuth: false,
    };
  }
  const ip = req.ip;
  if (!ip) return null;
  return {
    cache: ipBuckets,
    key: `ip:${ip}`,
    limit: ANON_SEARCH_LIMIT,
    windowMs: ANON_SEARCH_WINDOW_MS,
    requiresAuth: true,
  };
}

function isFirstPage(req: AuthedRequest): boolean {
  const raw = req.query?.page;
  if (raw === undefined || raw === null || raw === '') return true;
  return String(raw) === '1';
}

export function rateLimitSearch(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!isFirstPage(req)) {
    next();
    return;
  }

  const bucket = selectBucket(req);
  if (!bucket) {
    next();
    return;
  }

  const now = Date.now();
  const cutoff = now - bucket.windowMs;
  const existing = bucket.cache.get(bucket.key) ?? [];
  const recent = existing.filter((t) => t > cutoff);

  if (recent.length >= bucket.limit) {
    const oldest = recent[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + bucket.windowMs - now);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    const windowSeconds = Math.round(bucket.windowMs / 1000);

    const message = bucket.requiresAuth
      ? `You've reached the limit of ${bucket.limit} searches per day for anonymous users. Sign in or register to keep searching.`
      : `You've reached the limit of ${bucket.limit} searches per hour. Please try again later.`;

    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'rate_limited',
      message,
      limit: bucket.limit,
      windowSeconds,
      retryAfter: retryAfterSec,
      requiresAuth: bucket.requiresAuth,
    });
    return;
  }

  recent.push(now);
  bucket.cache.set(bucket.key, recent);
  next();
}
