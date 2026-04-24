import { Timestamp } from "firebase-admin/firestore";

export interface UserDocument {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
