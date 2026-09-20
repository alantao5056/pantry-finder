import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { cookieOptions } from '../config/auth';
import { GA_CLIENT_COOKIE, GA_CLIENT_COOKIE_MAX_AGE } from '../config/analytics';
import { analyticsService } from '../services/analytics.service';
import { AuthedRequest } from './auth.middleware';

// The request-scoped anonymous visitor id, populated by trackApiUsage.
// Downstream middleware and controllers must read `req.clientId` rather than
// `req.cookies[GA_CLIENT_COOKIE]`: on a visitor's very first request the cookie
// has only been written to the response, so it isn't in `req.cookies` yet.
export interface TrackedRequest extends Request {
  clientId?: string;
}

// Global middleware that reports every request to GA4 as an `api_request` event.
// Registered after cookie-parser and before the routes in index.ts.
export function trackApiUsage(
  req: AuthedRequest & TrackedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip CORS preflight and uptime checks to keep them out of the data.
  if (req.method === 'OPTIONS' || req.path === '/health') {
    next();
    return;
  }

  const start = Date.now();

  // Stable per-client id for anonymous traffic; set before next() so headers aren't sent.
  let clientId: string | undefined = req.cookies?.[GA_CLIENT_COOKIE];
  if (!clientId) {
    clientId = randomUUID();
    res.cookie(GA_CLIENT_COOKIE, clientId, {
      ...cookieOptions(),
      maxAge: GA_CLIENT_COOKIE_MAX_AGE,
    });
  }
  req.clientId = clientId;

  // 'finish' fires after the route's auth middleware ran (so req.user is populated)
  // and the response is complete (final status code and duration).
  res.on('finish', () => {
    // Normalize the path to the route pattern (e.g. /pantries/:id) to avoid
    // high-cardinality endpoints from ids in the URL.
    const endpoint = req.baseUrl + (req.route?.path ?? '') || req.path;
    analyticsService.track({
      clientId: clientId as string,
      userId: req.user?.sub,
      name: 'api_request',
      params: {
        method: req.method,
        endpoint,
        status_code: res.statusCode,
        duration_ms: Date.now() - start,
        authenticated: Boolean(req.user?.sub),
      },
    });
  });

  next();
}
