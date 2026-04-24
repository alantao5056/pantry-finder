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
import { UserService } from '../services/user.service';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

interface RegisterBody {
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  password?: unknown;
}

export class AuthController {
  private readonly userService = new UserService();

  public async register(req: Request<{}, {}, RegisterBody>, res: Response): Promise<void> {
    const { email, firstName, lastName, password } = req.body ?? {};

    if (
      typeof email !== 'string' ||
      typeof firstName !== 'string' ||
      typeof lastName !== 'string' ||
      typeof password !== 'string'
    ) {
      res.status(400).json({ error: 'email, firstName, lastName, and password are required.' });
      return;
    }

    const result = await this.userService.createUser(email, firstName, lastName, password);

    if (!result.success) {
      if (result.error === 'EMAIL_TAKEN') {
        res.status(409).json({ error: 'Email is already taken.' });
      } else {
        res.status(500).json({ error: 'Internal error.' });
      }
      return;
    }

    res.status(201).json({ ok: true });
  }


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
