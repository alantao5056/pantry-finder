/**
 * Conversion factor for miles to kilometers.
 * 1 mile is approximately 1.60934 kilometers.
 */
export const MILES_TO_KM_FACTOR = 1.60934;

/**
 * Converts a distance from miles to kilometers.
 * 
 * @param miles - The distance in miles.
 * @returns The equivalent distance in kilometers.
 */
export function milesToKilometers(miles: number): number {
  return miles * MILES_TO_KM_FACTOR;
}

/**
 * Converts a distance from kilometers to miles.
 * 
 * @param kilometers - The distance in kilometers.
 * @returns The equivalent distance in miles.
 */
export function kilometersToMiles(kilometers: number): number {
  return kilometers / MILES_TO_KM_FACTOR;
}
