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
  description?: string;
  food: string[];
  notes?: string;
  schedules: Schedule[];
}

export interface Pantry {
  id: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  phone?: string;
  about?: string;
  notes?: string;
  schedules: Schedule[];
  services: Service[];
}
