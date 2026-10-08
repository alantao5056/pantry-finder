export interface Schedule {
  weekDay: string;
  start: string;
  end: string;
  notes?: string;
  message?: string;
  isEveryOtherWeek: string;
}

export interface Service {
  name: string;
  category: string;
  program?: string;
  description?: string;
  food: string[];
  notes?: string;
  schedules: Schedule[];
}

export interface Pantry {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  latitude: number;
  longitude: number;
  distance?: number;
  phone?: string;
  email?: string;
  contactName?: string;
  website?: string;
  about?: string;
  notes?: string;
  heartCount?: number;
  schedules: Schedule[];
  services: Service[];
}

// One covered city: `city`/`state` hold display values (e.g. "Austin", "TX"),
// the slugs are the URL params for the /{state}/{city} landing pages.
export interface CitySummary {
  city: string;
  state: string;
  citySlug: string;
  stateSlug: string;
  pantryCount: number;
}

export interface StateSummary {
  state: string;
  stateSlug: string;
  cityCount: number;
  pantryCount: number;
}

// Firestore docs for the precomputed browse index: `states/{stateSlug}` and
// `cities/{stateSlug}_{citySlug}`. Written by the sitemap tool (tools/sitemap),
// read by the API (city.service.ts) so it never has to scan the pantries
// collection at runtime.
export interface StateIndexDocument extends StateSummary {
  updatedAt: string; // ISO timestamp of the index rebuild that wrote this doc
}

export interface CityIndexDocument extends CitySummary {
  // Every raw (city, state) string pair that collapsed into this slug —
  // Firestore stores city names as-is (mixed casing/punctuation), so by-city
  // pantry queries must use the exact stored values rather than the slug.
  variants: { city: string; state: string }[];
  updatedAt: string;
}

export interface GetCitiesResponseDto {
  cities: CitySummary[];
}

export interface GetStatesResponseDto {
  states: StateSummary[];
}

export interface GetCityPantriesResponseDto {
  city: string;
  state: string;
  pantryCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  pantries: Pantry[];
}
