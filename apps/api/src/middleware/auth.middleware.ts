import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { COOKIE_NAME, JWT_SECRET } from '../config/auth';

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
