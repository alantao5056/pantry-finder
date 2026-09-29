import type { Coordinates } from "../geocoding/types";
import type { AddressGeocoder } from "../geocoding/AddressGeocoder";
import type { ZipcodeGeocoder } from "../geocoding/ZipcodeGeocoder";
import type { LocationGeocoder } from "../geocoding/LocationGeocoder";
import { CensusGeocoder } from "../geocoding/providers/CensusGeocoder";
import { ApiNinjasZipcodeGeocoder } from "../geocoding/providers/ApiNinjasZipcodeGeocoder";
import { GeocodioGeocoder } from "../geocoding/providers/GeocodioGeocoder";
import { FallbackAddressGeocoder } from "../geocoding/FallbackAddressGeocoder";
import { CachedAddressGeocoder } from "../geocoding/cache/CachedAddressGeocoder";
import { CachedZipcodeGeocoder } from "../geocoding/cache/CachedZipcodeGeocoder";
import { CachedLocationGeocoder } from "../geocoding/cache/CachedLocationGeocoder";

export class GeoService {
  // Census first (free); Geocodio covers addresses missing from Census data,
  // e.g. house numbers on interstate frontage roads.
  private readonly addressGeocoder: AddressGeocoder =
    new CachedAddressGeocoder(
      new FallbackAddressGeocoder([
        new CensusGeocoder(),
        new GeocodioGeocoder(process.env.GEOCODIO_API_KEY ?? "", true),
      ])
    );

  private readonly zipcodeGeocoder: ZipcodeGeocoder =
    new CachedZipcodeGeocoder(
      new ApiNinjasZipcodeGeocoder(process.env.API_NINJAS_KEY ?? "")
    );

  private readonly locationGeocoder: LocationGeocoder =
    new CachedLocationGeocoder(
      new GeocodioGeocoder(process.env.GEOCODIO_API_KEY ?? "")
    );

  public geocodeAddress(address: string): Promise<Coordinates | null> {
    return this.addressGeocoder.geocode(address);
  }

  public geocodeZipcode(zipcode: string): Promise<Coordinates | null> {
    return this.zipcodeGeocoder.geocode(zipcode);
  }

  public geocodeLocation(location: string): Promise<Coordinates | null> {
    return this.locationGeocoder.geocode(location);
  }
}
