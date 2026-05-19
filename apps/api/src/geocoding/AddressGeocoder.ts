import type { Coordinates } from "./types";

export interface AddressGeocoder {
  geocode(address: string): Promise<Coordinates | null>;
}
