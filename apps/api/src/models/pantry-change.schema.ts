import { Timestamp } from 'firebase-admin/firestore';
import { FieldSource, TrackedPantryField } from './pantry.schema';

// Firestore shape of one change-log entry (`pantry_changes`). Every write to a
// live pantry records what changed so it can be audited and rolled back.
//   create  — `newValue` is the full pantry document as written
//   update  — one entry per changed field, with `oldValue` / `newValue`
//   archive / restore — pantry moved to / from `pantries_archive`
export interface PantryChangeDocument {
  pantryId: string;
  kind: 'create' | 'update' | 'archive' | 'restore';
  field?: TrackedPantryField;
  oldValue?: unknown;
  newValue?: unknown;
  source: FieldSource;
  // Admin email, or 'crawler'.
  actor: string;
  runId?: string;
  reviewItemId?: string;
  createdAt: Timestamp;
}
