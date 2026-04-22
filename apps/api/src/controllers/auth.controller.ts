import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  AUTH_PASSWORD,
  AUTH_USERNAME,
  COOKIE_NAME,
  JWT_EXPIRES_IN,
  JWT_SECRET,
  cookieOptions,
} from '../config/auth';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export class AuthController {
  public async login(req: Request<{}, {}, LoginBody>, res: Response): Promise<void> {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.status(200).json({ ok: true });
  }

  public async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.status(200).json({ ok: true });
  }
}
