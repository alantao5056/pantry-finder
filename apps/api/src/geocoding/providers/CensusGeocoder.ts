import type { AddressGeocoder } from "../AddressGeocoder";
import type { Coordinates } from "../types";
import { fetchJsonWithRetry } from "./http";

type CensusCoordinates = { x: number; y: number };
type CensusAddressMatch = {
  coordinates?: CensusCoordinates;
};

type CensusResponse = {
  result?: {
    addressMatches?: CensusAddressMatch[];
  };
};

export class CensusGeocoder implements AddressGeocoder {
  private readonly baseUrl: string = "https://geocoding.geo.census.gov/geocoder";
  private readonly benchmark: string = "Public_AR_Current";

  public async geocode(address: string): Promise<Coordinates | null> {
    const formatted = formatAddressForCensus(address);
    if (!formatted) throw new Error("Address is empty.");

    const url = new URL(`${this.baseUrl}/locations/onelineaddress`);
    url.searchParams.set("address", formatted);
    url.searchParams.set("benchmark", this.benchmark);
    url.searchParams.set("format", "json");

    const json = await fetchJsonWithRetry<CensusResponse>(url.toString(), {
      timeoutMs: 8000,
      maxRetries: 2,
      baseDelayMs: 250,
    });

    const matches = json?.result?.addressMatches;
    if (!Array.isArray(matches) || matches.length === 0) {
      return null;
    }

    const coords = matches[0]?.coordinates;
    if (!coords || typeof coords.x !== "number" || typeof coords.y !== "number") {
      return null;
    }

    return { longitude: coords.x, latitude: coords.y };
  }
}

function formatAddressForCensus(input: string): string {
  const withoutCommas = input.replace(/,/g, " ");
  const collapsed = withoutCommas.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const tokens = collapsed.split(" ");
  const encodedTokens = tokens.map((t) => encodeURIComponent(t));
  return encodedTokens.join("+");
}
