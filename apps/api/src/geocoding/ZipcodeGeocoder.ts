import type { Coordinates } from "./types";

export interface ZipcodeGeocoder {
  geocode(zipcode: string): Promise<Coordinates | null>;
}
