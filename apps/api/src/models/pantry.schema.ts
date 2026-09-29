// The Firestore shapes of `pantries` live in @pantry-finder/shared/firestore so
// tools/crawler writes the same shape the API reads.
export type {
  FieldProvenance,
  FieldSource,
  PantryDocument,
  ScheduleSchema,
  ServiceSchema,
  TrackedPantryField,
} from '@pantry-finder/shared/firestore';
