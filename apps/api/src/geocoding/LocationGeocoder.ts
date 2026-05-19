import type { Coordinates } from "./types";

export interface LocationGeocoder {
  geocode(location: string): Promise<Coordinates | null>;
}
