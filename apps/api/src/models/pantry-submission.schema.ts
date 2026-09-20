import { Timestamp } from 'firebase-admin/firestore';

// Firestore shape for a user-submitted pantry awaiting review. Stored in the
// `pantry_submissions` collection (a moderation queue), kept SEPARATE from the
// live `pantries` collection. The pantry fields intentionally mirror
// `pantry.schema.ts` (PantryDocument / ServiceSchema / ScheduleSchema) field for
// field, so approving a submission is a straightforward copy + geocode rather
// than a remapping. The only fields omitted are the ones the server assigns at
// approval time: `id`, `coordinates`, and `heartCount`.

export interface SubmissionScheduleSchema {
  weekDay: string;
  startTime: string;
  endTime: string;
  notes?: string;
  everyOtherWeekIndicator?: boolean;
}

export interface SubmissionServiceSchema {
  name: string;
  categoryDescription: string;
  foodProgramTypeDescription?: string;
  foodOfferings: string[];
  notes?: string;
  schedules: SubmissionScheduleSchema[];
}

export interface PantrySubmissionDocument {
  // Pantry details (mirror PantryDocument field names).
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  website?: string;
  aboutUs?: string;
  contactName?: string;
  notes?: string;
  schedules: SubmissionScheduleSchema[];
  services: SubmissionServiceSchema[];

  // Submitter contact info (all required at the API; used only for follow-up).
  submitterFirstName: string;
  submitterLastName: string;
  submitterEmail: string;
  submitterRelationship: string;
  // The logged-in submitter's account email (the JWT `sub`). Set only when the
  // submitter was authenticated; kept distinct from `submitterEmail`, which is
  // the free-text contact email they typed and may have edited.
  submitterAccountEmail?: string;

  // Moderation metadata.
  status: 'pending';
  createdAt: Timestamp;
}
