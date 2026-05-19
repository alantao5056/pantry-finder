import type { ZipcodeGeocoder } from "../ZipcodeGeocoder";
import type { Coordinates } from "../types";
import { fetchJsonWithRetry } from "./http";

type ApiNinjasZipRecord = { lat?: string; lon?: string };

export class ApiNinjasZipcodeGeocoder implements ZipcodeGeocoder {
  private readonly baseUrl: string = "https://api.api-ninjas.com/v1/zipcode";

  constructor(private readonly apiKey: string) {}

  public async geocode(input: string): Promise<Coordinates | null> {
    if (!this.apiKey) {
      throw new Error("API_NINJAS_KEY is not configured.");
    }

    const zip = normalizeZip(input);

    const url = new URL(this.baseUrl);
    url.searchParams.set("zip", zip);

    let json: ApiNinjasZipRecord[];
    try {
      json = await fetchJsonWithRetry<ApiNinjasZipRecord[]>(url.toString(), {
        timeoutMs: 8000,
        maxRetries: 2,
        baseDelayMs: 250,
        headers: { "X-Api-Key": this.apiKey },
      });
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        throw new Error(
          `API Ninjas auth failed (${err.status}): check API_NINJAS_KEY.`
        );
      }
      throw err;
    }

    if (!Array.isArray(json) || json.length === 0) {
      return null;
    }

    const first = json[0];
    if (typeof first?.lat !== "string" || typeof first?.lon !== "string") {
      return null;
    }

    const latitude = parseFloat(first.lat);
    const longitude = parseFloat(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  }
}

function normalizeZip(input: string): string {
  const trimmed = input.trim();
  const m = /^(\d{5})(?:-\d{4})?$/.exec(trimmed);
  if (!m) throw new Error(`Invalid US zipcode: "${input}"`);
  return m[1];
}
