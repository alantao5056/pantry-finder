import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import {
  COOKIE_NAME,
  GOOGLE_CLIENT_ID,
  JWT_EXPIRES_IN,
  JWT_SECRET,
  cookieOptions,
} from '../config/auth';
import { UserService } from '../services/user.service';
import { CachedUserService } from '../services/cached-user.service';
import { AuthedRequest } from '../middleware/auth.middleware';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface RegisterBody {
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  password?: unknown;
}

interface GoogleLoginBody {
  idToken?: unknown;
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export class AuthController {
  private readonly userService = new CachedUserService(new UserService());

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
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const result = await this.userService.verifyUser(email, password);

    if (!result.success) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ sub: email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.status(200).json({ ok: true });
  }

  public async googleLogin(req: Request<{}, {}, GoogleLoginBody>, res: Response): Promise<void> {
    const { idToken } = req.body ?? {};

    if (typeof idToken !== 'string') {
      res.status(400).json({ error: 'idToken is required.' });
      return;
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    if (!payload || !payload.email || payload.email_verified !== true) {
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    const user = await this.userService.findOrCreateGoogleUser({
      email: payload.email,
      firstName: payload.given_name ?? '',
      lastName: payload.family_name ?? '',
      googleId: payload.sub,
      picture: payload.picture,
    });

    const token = jwt.sign({ sub: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.status(200).json({ ok: true });
  }

  public async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.status(200).json({ ok: true });
  }

  public async me(req: AuthedRequest, res: Response): Promise<void> {
    const email = req.user?.sub;
    if (!email) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const profile = await this.userService.getUserProfile(email);
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json(profile);
  }
}
