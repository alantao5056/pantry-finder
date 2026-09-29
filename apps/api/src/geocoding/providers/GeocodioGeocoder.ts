import type { AddressGeocoder } from "../AddressGeocoder";
import type { LocationGeocoder } from "../LocationGeocoder";
import type { Coordinates } from "../types";
import { fetchJsonWithRetry } from "./http";

type GeocodioLocation = { lat?: number; lng?: number };
type GeocodioResult = { location?: GeocodioLocation; accuracy?: number; accuracy_type?: string };
type GeocodioResponse = { results?: GeocodioResult[] };

// Result types that pin a house number, not a street/city/ZIP centroid.
const ADDRESS_LEVEL = new Set(["rooftop", "point", "range_interpolation", "nearest_rooftop_match"]);

export class GeocodioGeocoder implements LocationGeocoder, AddressGeocoder {
  private readonly baseUrl: string = "https://api.geocod.io/v1.12/geocode";

  /**
   * @param addressLevelOnly Reject results coarser than a house number — for
   *   pantry addresses, where a city centroid would silently misplace the pin.
   */
  constructor(
    private readonly apiKey: string,
    private readonly addressLevelOnly = false
  ) {}

  public async geocode(input: string): Promise<Coordinates | null> {
    if (!this.apiKey) {
      throw new Error("GEOCODIO_API_KEY is not configured.");
    }

    const q = input.trim();
    if (!q) throw new Error("Location is empty.");

    const url = new URL(this.baseUrl);
    url.searchParams.set("q", q);
    url.searchParams.set("country", "USA");
    url.searchParams.set("api_key", this.apiKey);

    let json: GeocodioResponse;
    try {
      json = await fetchJsonWithRetry<GeocodioResponse>(url.toString(), {
        timeoutMs: 8000,
        maxRetries: 2,
        baseDelayMs: 250,
      });
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        throw new Error(
          `Geocodio auth failed (${err.status}): check GEOCODIO_API_KEY.`
        );
      }
      throw err;
    }

    const results = json?.results;
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const first = results[0];
    if (this.addressLevelOnly && !ADDRESS_LEVEL.has(first?.accuracy_type ?? "")) {
      return null;
    }

    const loc = first?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return null;
    }

    return { latitude: loc.lat, longitude: loc.lng };
  }
}
