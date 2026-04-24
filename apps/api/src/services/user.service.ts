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

export class UserService {
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
}
