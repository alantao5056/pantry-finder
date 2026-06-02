import { Timestamp } from "firebase-admin/firestore";

export interface UserDocument {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash?: string;
  googleId?: string;
  // Google profile photo URL, refreshed on each Google sign-in. Absent for
  // password accounts (and Google accounts with no photo).
  picture?: string;
  // Set to 'google' for accounts created via Google sign-in. Unset (undefined)
  // means the account was created with custom email/password.
  provider?: 'google';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
