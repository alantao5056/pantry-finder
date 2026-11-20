// ---- Contact Us messages ----

export const CONTACT_CATEGORIES = ['pantry_info', 'pantry_owner', 'website', 'other'] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  pantry_info: 'Wrong or outdated pantry info',
  pantry_owner: "I run a pantry and want to update it",
  website: 'Website problem or suggestion',
  other: 'Something else',
};

export const CONTACT_SUBJECT_MAX = 200;
export const CONTACT_MESSAGE_MAX = 2000;

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === 'string' && (CONTACT_CATEGORIES as readonly string[]).includes(value);
}

export type ContactMessageStatus = 'new' | 'read';

export interface SubmitContactRequest {
  category: ContactCategory;
  subject: string;
  message: string;
}

export interface ContactMessageSummary {
  id: string;
  category: ContactCategory;
  subject: string;
  message: string;
  userEmail: string;
  userName?: string;
  status: ContactMessageStatus;
  createdAt: string;
  readAt?: string;
  readBy?: string;
}

export interface ListContactMessagesResponse {
  messages: ContactMessageSummary[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  nextCursor?: string;
}
