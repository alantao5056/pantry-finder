import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { UserDocument } from '../models/user.schema';

const scryptAsync = promisify<string, string, number, Buffer>(scrypt);

const USERS_COLLECTION = 'users';
const SCRYPT_KEYLEN = 64;

type CreateUserResult =
  | { success: true; user: UserDocument }
  | { success: false; error: 'EMAIL_TAKEN' };

type VerifyUserResult =
  | { success: true; user: UserDocument }
  | { success: false };

export interface UserProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

export interface GoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  googleId: string;
  picture?: string;
}

export class UserService {
  private async getUserByEmail(email: string): Promise<UserDocument | null> {
    const doc = await db.collection(USERS_COLLECTION).doc(email).get();
    if (!doc.exists) return null;
    return doc.data() as UserDocument;
  }

  public async getUserProfile(email: string): Promise<UserProfile | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    return { email: user.email, firstName: user.firstName, lastName: user.lastName, picture: user.picture };
  }

  public async verifyUser(email: string, password: string): Promise<VerifyUserResult> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      return { success: false };
    }

    const [salt, storedHex] = user.passwordHash.split(':');
    const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN);

    if (hash.toString('hex') !== storedHex) {
      return { success: false };
    }

    return { success: true, user };
  }

  public async createUser(email: string, firstName: string, lastName: string, password: string): Promise<CreateUserResult> {
    const salt = randomBytes(16).toString('hex');
    const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    const passwordHash = `${salt}:${hash.toString('hex')}`;

    const now = Timestamp.now();
    const docRef = db.collection(USERS_COLLECTION).doc(email);

    const user: UserDocument = {
      email,
      firstName,
      lastName,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docRef.create(user);
    } catch (err: any) {
      if (err.code === 6) {
        return { success: false, error: 'EMAIL_TAKEN' };
      }
      throw err;
    }

    return { success: true, user };
  }

  public async findOrCreateGoogleUser(profile: GoogleProfile): Promise<UserDocument> {
    const { email, firstName, lastName, googleId, picture } = profile;
    const docRef = db.collection(USERS_COLLECTION).doc(email);

    const existing = await this.getUserByEmail(email);
    if (existing) {
      // Link the Google identity to the existing account if not already stored,
      // and keep the cached profile photo fresh on each sign-in.
      const updates: Partial<UserDocument> = {};
      if (existing.googleId !== googleId) updates.googleId = googleId;
      if (picture && existing.picture !== picture) updates.picture = picture;

      if (Object.keys(updates).length === 0) return existing;

      const now = Timestamp.now();
      updates.updatedAt = now;
      await docRef.update(updates);
      return { ...existing, ...updates };
    }

    const now = Timestamp.now();
    const user: UserDocument = {
      email,
      firstName,
      lastName,
      googleId,
      provider: 'google',
      createdAt: now,
      updatedAt: now,
    };
    // Firestore rejects undefined fields, so only set picture when present.
    if (picture) user.picture = picture;

    await docRef.set(user);
    return user;
  }
}
