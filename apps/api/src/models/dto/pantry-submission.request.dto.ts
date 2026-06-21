// Wire shape of an "Add a Pantry" submission as it arrives from the client.
// Every field is `unknown` because the body is untrusted — the controller
// validates and narrows each field before building a PantrySubmissionDocument.

export interface SubmitScheduleDto {
  weekDay?: unknown;
  start?: unknown;
  end?: unknown;
  notes?: unknown;
  everyOtherWeek?: unknown;
}

export interface SubmitServiceDto {
  name?: unknown;
  category?: unknown;
  program?: unknown;
  foods?: unknown;       // string[]
  notes?: unknown;
  schedules?: unknown;   // SubmitScheduleDto[]
}

export interface SubmitPantryRequestDto {
  // Pantry details
  name?: unknown;
  street?: unknown;      // → address1
  address2?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  phone?: unknown;
  website?: unknown;
  about?: unknown;       // → aboutUs
  contactName?: unknown;
  notes?: unknown;
  schedules?: unknown;   // SubmitScheduleDto[] (pantry-level hours)
  services?: unknown;    // SubmitServiceDto[]

  // Submitter info
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  relationship?: unknown;
}
