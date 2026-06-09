import { Response, NextFunction } from 'express';
import { logRequest } from '@pantry-finder/shared/logging';
import { AuthedRequest } from './auth.middleware';

// Global middleware that records every request to Google Cloud Logging as an
// operational request log (distinct from the GA4 product analytics in
// trackApiUsage). Registered after cookie-parser and before the routes.
export function requestLog(req: AuthedRequest, res: Response, next: NextFunction): void {
  // Skip CORS preflight and uptime checks to keep them out of the log.
  if (req.method === 'OPTIONS' || req.path === '/health') {
    next();
    return;
  }

  const start = Date.now();

  // 'finish' fires after the route's auth middleware ran (so req.user is
  // populated) and the response is complete (final status code and duration).
  res.on('finish', () => {
    logRequest({
      source: 'api',
      user: req.user?.sub ?? null,
      ip: req.ip ?? '',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      userAgent: req.get('user-agent'),
      referer: req.get('referer'),
    });
  });

  next();
}
