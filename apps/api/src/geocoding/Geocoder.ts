import type { Coordinates } from "./types";

export interface Geocoder {
  geocode(address: string): Promise<Coordinates | null>;
}
