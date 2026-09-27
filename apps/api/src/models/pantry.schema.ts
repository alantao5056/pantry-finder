import { GeoPoint, Timestamp } from "firebase-admin/firestore";

// Where a pantry field's current value came from. `import` is the original
// bulk import; the rest are written by the admin/crawler pipeline
// (see docs/crawler-design.md). Crawled data outranks the original import.
export type FieldSource = 'import' | 'user_submission' | 'crawler' | 'admin';

// Pantry fields whose provenance is tracked in `fieldSources`.
export type TrackedPantryField =
  | 'name'
  | 'address1'
  | 'address2'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'phone'
  | 'website'
  | 'aboutUs'
  | 'contactName'
  | 'notes'
  | 'schedules'
  | 'services';

export interface FieldProvenance {
  source: FieldSource;
  at: Timestamp;
}

export interface ScheduleSchema {
  startTime: string;
  endTime: string;
  weekDay: string;
  notes?: string;
  contactForHoursMessage?: string;
  everyOtherWeekIndicator?: boolean;
}

export interface ServiceSchema {
  name: string;
  categoryDescription: string;
  foodProgramTypeDescription: string;
  foodOfferings?: string[];
  notes?: string;
  schedules: ScheduleSchema[];
}

export interface PantryDocument {
  id: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  coordinates: GeoPoint;
  website?: string;
  aboutUs?: string;
  contactName?: string;
  notes?: string;
  heartCount?: number;
  schedules: ScheduleSchema[];
  services: ServiceSchema[];
  // Origin of the whole record: the upstream source's name for bulk-imported
  // pantries (with `pantryId` = that source's id), 'user_submission' for
  // approved submissions.
  source?: string;
  pantryId?: string;
  fieldSources?: Partial<Record<TrackedPantryField, FieldProvenance>>;
  lastCrawledAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
