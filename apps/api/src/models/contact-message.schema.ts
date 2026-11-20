import { Timestamp } from 'firebase-admin/firestore';
import type { ContactCategory, ContactMessageStatus } from '@pantry-finder/shared';

// Firestore shape of a Contact Us message (`contact_messages` collection).
export interface ContactMessageDocument {
  category: ContactCategory;
  subject: string;
  message: string;
  /** The sender's account email (JWT `sub`). */
  userEmail: string;
  userName?: string;
  status: ContactMessageStatus;
  createdAt: Timestamp;
  readAt?: Timestamp;
  readBy?: string;
}
