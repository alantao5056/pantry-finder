import { Response, NextFunction } from 'express';
import { AuthedRequest } from './auth.middleware';
import { createRateLimiter } from '../cache/rateLimiter';
import { isAnonymousSearchEnabled } from '../services/app-config.service';
import {
  ANON_SEARCH_LIMIT,
  ANON_SEARCH_WINDOW_MS,
  USER_SEARCH_LIMIT,
  USER_SEARCH_WINDOW_MS,
  SUBMISSION_LIMIT,
  SUBMISSION_WINDOW_MS,
  BROWSE_BURST_LIMIT,
  BROWSE_BURST_WINDOW_MS,
  BROWSE_HOURLY_LIMIT,
  BROWSE_HOURLY_WINDOW_MS,
} from '../config/constants';

const limiter = createRateLimiter();

type Bucket = {
  key: string;
  limit: number;
  windowMs: number;
  requiresAuth: boolean;
};

function selectBucket(req: AuthedRequest): Bucket | null {
  if (req.user?.sub) {
    return {
      key: `user:${req.user.sub}`,
      limit: USER_SEARCH_LIMIT,
      windowMs: USER_SEARCH_WINDOW_MS,
      requiresAuth: false,
    };
  }
  const ip = req.ip;
  if (!ip) return null;
  return {
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

export async function rateLimitSearch(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Runtime switch (Firestore appConfig/search). Checked on every page so
  // pagination can't bypass it.
  if (!req.user?.sub && !(await isAnonymousSearchEnabled())) {
    res.status(401).json({
      error: 'auth_required',
      message: 'Please sign in or create a free account to search for pantries.',
      requiresAuth: true,
    });
    return;
  }

  if (!isFirstPage(req)) {
    next();
    return;
  }

  const bucket = selectBucket(req);
  if (!bucket) {
    next();
    return;
  }

  // The limiter fails open internally; this catch is a last resort so a bug
  // here can never block searches.
  let result;
  try {
    result = await limiter.consume(bucket.key, bucket.limit, bucket.windowMs);
  } catch (err) {
    console.error('Rate limit check failed, allowing request:', err);
    next();
    return;
  }

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
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

  next();
}

/**
 * Throttles "Add a Pantry" submissions. Keyed by user when logged in, else by
 * IP. Fails open (like rateLimitSearch) so a limiter outage never blocks a
 * legitimate submission.
 */
export async function rateLimitSubmission(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const key = req.user?.sub ? `submit:user:${req.user.sub}` : req.ip ? `submit:ip:${req.ip}` : null;
  if (!key) {
    next();
    return;
  }

  let result;
  try {
    result = await limiter.consume(key, SUBMISSION_LIMIT, SUBMISSION_WINDOW_MS);
  } catch (err) {
    console.error('Submission rate limit check failed, allowing request:', err);
    next();
    return;
  }

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'rate_limited',
      message: `You've reached the limit of ${SUBMISSION_LIMIT} pantry submissions per day. Please try again later.`,
      limit: SUBMISSION_LIMIT,
      windowSeconds: Math.round(SUBMISSION_WINDOW_MS / 1000),
      retryAfter: retryAfterSec,
    });
    return;
  }

  next();
}

const BROWSE_WINDOWS = [
  { suffix: 'm', limit: BROWSE_BURST_LIMIT, windowMs: BROWSE_BURST_WINDOW_MS },
  { suffix: 'h', limit: BROWSE_HOURLY_LIMIT, windowMs: BROWSE_HOURLY_WINDOW_MS },
];

function isLoopback(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
}

/**
 * Throttles the browse endpoints (/states/*, /pantries/:id) so one client
 * can't walk every city page at full speed — each cold city costs Firestore
 * reads. Keyed by user when logged in, else by IP, in its own buckets (never
 * touches the search quota). Fails open like the other limiters.
 *
 * SSR fetches reach the API over loopback with the visitor's X-Forwarded-For
 * (see apps/web useApi), so req.ip is the real visitor. A loopback req.ip
 * means that header went missing; skip rather than throttle every visitor in
 * one shared bucket.
 */
export async function rateLimitBrowse(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  let key: string;
  if (req.user?.sub) {
    key = `browse:user:${req.user.sub}`;
  } else if (req.ip && !isLoopback(req.ip)) {
    key = `browse:ip:${req.ip}`;
  } else {
    next();
    return;
  }

  for (const { suffix, limit, windowMs } of BROWSE_WINDOWS) {
    let result;
    try {
      result = await limiter.consume(`${key}:${suffix}`, limit, windowMs);
    } catch (err) {
      console.error('Browse rate limit check failed, allowing request:', err);
      next();
      return;
    }

    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'rate_limited',
        message: 'Too many requests. Please slow down and try again shortly.',
        limit,
        windowSeconds: Math.round(windowMs / 1000),
        retryAfter: retryAfterSec,
      });
      return;
    }
  }

  next();
}
