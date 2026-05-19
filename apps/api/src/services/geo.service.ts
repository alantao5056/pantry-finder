import type { Coordinates } from "../geocoding/types";
import type { AddressGeocoder } from "../geocoding/AddressGeocoder";
import type { ZipcodeGeocoder } from "../geocoding/ZipcodeGeocoder";
import { CensusGeocoder } from "../geocoding/providers/CensusGeocoder";
import { ApiNinjasZipcodeGeocoder } from "../geocoding/providers/ApiNinjasZipcodeGeocoder";
import { CachedAddressGeocoder } from "../geocoding/cache/CachedAddressGeocoder";
import { CachedZipcodeGeocoder } from "../geocoding/cache/CachedZipcodeGeocoder";

export class GeoService {
  private readonly addressGeocoder: AddressGeocoder =
    new CachedAddressGeocoder(new CensusGeocoder());

  private readonly zipcodeGeocoder: ZipcodeGeocoder =
    new CachedZipcodeGeocoder(
      new ApiNinjasZipcodeGeocoder(process.env.API_NINJAS_KEY ?? "")
    );

  public geocodeAddress(address: string): Promise<Coordinates | null> {
    return this.addressGeocoder.geocode(address);
  }

  public geocodeZipcode(zipcode: string): Promise<Coordinates | null> {
    return this.zipcodeGeocoder.geocode(zipcode);
  }
}
