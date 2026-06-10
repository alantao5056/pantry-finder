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
