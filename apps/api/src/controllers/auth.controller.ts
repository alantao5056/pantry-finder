import { Request, Response } from 'express';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { JwksClient } from 'jwks-rsa';
import {
  COOKIE_NAME,
  GOOGLE_CLIENT_ID,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_TENANT,
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

interface MicrosoftLoginBody {
  idToken?: unknown;
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Microsoft signs ID tokens with rotating RSA keys published as a JWKS. The
// `common` key set covers every tenant, so it works for both personal and
// work/school accounts. jwks-rsa caches and rate-limits key fetches.
const microsoftJwks = new JwksClient({
  jwksUri: `https://login.microsoftonline.com/${MICROSOFT_TENANT}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

function microsoftSigningKey(header: JwtHeader, callback: SigningKeyCallback): void {
  microsoftJwks
    .getSigningKey(header.kid)
    .then((key) => callback(null, key.getPublicKey()))
    .catch((err) => callback(err as Error));
}

interface MicrosoftIdTokenClaims {
  iss?: string;
  oid?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

/** Verify a Microsoft ID token against the JWKS, scoped to our app's audience. */
function verifyMicrosoftIdToken(idToken: string): Promise<MicrosoftIdTokenClaims> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      microsoftSigningKey,
      { audience: MICROSOFT_CLIENT_ID, algorithms: ['RS256'] },
      (err, decoded) => {
        if (err || !decoded || typeof decoded === 'string') {
          reject(err ?? new Error('Invalid token'));
          return;
        }
        resolve(decoded as MicrosoftIdTokenClaims);
      },
    );
  });
}

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

  public async microsoftLogin(req: Request<{}, {}, MicrosoftLoginBody>, res: Response): Promise<void> {
    const { idToken } = req.body ?? {};

    if (typeof idToken !== 'string') {
      res.status(400).json({ error: 'idToken is required.' });
      return;
    }

    let claims: MicrosoftIdTokenClaims;
    try {
      claims = await verifyMicrosoftIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid Microsoft token' });
      return;
    }

    // Under the `common` authority the issuer host is fixed but the tenant path
    // varies per account, so validate the host prefix rather than an exact issuer.
    if (!claims.iss?.startsWith('https://login.microsoftonline.com/')) {
      res.status(401).json({ error: 'Invalid Microsoft token' });
      return;
    }

    // Personal accounts expose the address in `email`; work/school accounts often
    // only carry it in `preferred_username` (the UPN).
    const email = claims.email || claims.preferred_username;
    const microsoftId = claims.oid || claims.sub;
    if (!email || !microsoftId) {
      res.status(401).json({ error: 'Invalid Microsoft token' });
      return;
    }

    // given_name/family_name are absent for some accounts; fall back to `name`.
    const nameParts = claims.name?.trim().split(/\s+/) ?? [];
    const firstName = claims.given_name ?? nameParts[0] ?? '';
    const lastName = claims.family_name ?? nameParts.slice(1).join(' ');

    const user = await this.userService.findOrCreateMicrosoftUser({
      email,
      firstName,
      lastName,
      microsoftId,
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
