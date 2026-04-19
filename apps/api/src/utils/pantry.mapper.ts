import { Pantry, Schedule, Service } from '@pantry-finder/types';
import { PantryDocument, ScheduleSchema, ServiceSchema } from '../models/pantry.schema';
import { kilometersToMiles } from '../utils/distance.util';

export function mapPantryDocumentToDto(doc: PantryDocument, id: string): Pantry {
  const addressParts = [
    doc.address1,
    doc.address2,
    doc.city,
    doc.state,
    doc.zipCode,
  ].filter(Boolean);

  const address = addressParts.join(', ');

  return {
    id: id,
    name: doc.name || '',
    address: address,
    latitude: doc.coordinates.latitude,
    longitude: doc.coordinates.longitude,
    distance: doc.distance? kilometersToMiles(doc.distance) : undefined,
    phone: doc.phone || undefined,
    about: doc.aboutUs || undefined,
    notes: doc.notes || undefined,
    schedules: (doc.schedules || []).map(mapScheduleToDto),
    services: (doc.services || []).map(mapServiceToDto),
  };
}

function mapScheduleToDto(schedule: ScheduleSchema): Schedule {
  return {
    weekDay: schedule.weekDay || '',
    start: schedule.startTime || '',
    end: schedule.endTime || '',
    isEveryOtherWeek: schedule.everyOtherWeekIndicator ? 'true' : 'false',
    notes: schedule.notes || undefined,
    message: schedule.contactForHoursMessage || undefined,
  };
}

function mapServiceToDto(service: ServiceSchema): Service {
  return {
    name: service.name || '',
    category: service.categoryDescription || '',
    program: service.foodProgramTypeDescription || undefined,
    notes: service.notes || undefined,
    food: service.foodOfferings || [],
    schedules: (service.schedules || []).map(mapScheduleToDto),
  };
}
