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
  latitude: number;
  longitude: number;
  distance?: number;
  phone?: string;
  about?: string;
  notes?: string;
  schedules: Schedule[];
  services: Service[];
}
