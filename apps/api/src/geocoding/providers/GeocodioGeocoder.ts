import type { LocationGeocoder } from "../LocationGeocoder";
import type { Coordinates } from "../types";
import { fetchJsonWithRetry } from "./http";

type GeocodioLocation = { lat?: number; lng?: number };
type GeocodioResult = { location?: GeocodioLocation; accuracy?: number };
type GeocodioResponse = { results?: GeocodioResult[] };

export class GeocodioGeocoder implements LocationGeocoder {
  private readonly baseUrl: string = "https://api.geocod.io/v1.12/geocode";

  constructor(private readonly apiKey: string) {}

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

    const loc = results[0]?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return null;
    }

    return { latitude: loc.lat, longitude: loc.lng };
  }
}
