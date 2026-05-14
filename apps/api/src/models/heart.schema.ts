import { Timestamp } from 'firebase-admin/firestore';

export interface HeartDocument {
  userId: string;
  pantryId: string;
  heartedAt: Timestamp;
}
