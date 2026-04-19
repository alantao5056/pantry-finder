import type { Geocoder } from "./Geocoder";
import { CensusGeocoder } from "./providers/CensusGeocoder";
import { CachedGeocoder } from "./cache/CachedGeocoder";

export class GeocoderFactory {
  public static create(): Geocoder {
    return new CachedGeocoder(new CensusGeocoder());
  }
}
