import { Timestamp } from "firebase-admin/firestore";

export interface UserDocument {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash?: string;
  googleId?: string;
  microsoftId?: string;
  // Google profile photo URL, refreshed on each Google sign-in. Absent for
  // password accounts, Microsoft accounts (no photo in the ID token), and
  // Google accounts with no photo.
  picture?: string;
  // Set to the provider an account was created with via social sign-in. Unset
  // (undefined) means the account was created with custom email/password.
  provider?: 'google' | 'microsoft';
  // Grants access to the admin site (apps/admin) via requireAdmin. Set by hand
  // in Firestore — deliberately no API or UI writes it.
  role?: 'admin';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
