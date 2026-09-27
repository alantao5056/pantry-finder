import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { COOKIE_NAME, JWT_SECRET } from '../config/auth';
import { UserService } from '../services/user.service';

export interface AuthedRequest extends Request {
  user?: { sub: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.user = { sub: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

const userService = new UserService();

/**
 * requireAuth + the account must have `role: 'admin'`. The role is re-read from
 * Firestore on every request (admin traffic is tiny) so revocation is instant.
 */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    userService
      .isAdmin(req.user!.sub)
      .then((isAdmin) => {
        if (!isAdmin) {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }
        next();
      })
      .catch(next);
  });
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      req.user = { sub: payload.sub };
    } catch {
      // Invalid/expired token: treat as anonymous, don't block the request.
    }
  }
  next();
}
