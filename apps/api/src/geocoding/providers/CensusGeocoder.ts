import type { Geocoder } from "../Geocoder";
import type { Coordinates } from "../types";

type CensusCoordinates = { x: number; y: number };
type CensusAddressMatch = {
  coordinates?: CensusCoordinates;
};

type CensusResponse = {
  result?: {
    addressMatches?: CensusAddressMatch[];
  };
};

export class CensusGeocoder implements Geocoder {
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

async function fetchJsonWithRetry<T>(
  url: string,
  retry: { timeoutMs: number; maxRetries: number; baseDelayMs: number }
): Promise<T> {
  let attempt = 0;
  let lastErr: any;

  while (attempt <= retry.maxRetries) {
    try {
      return await fetchJsonOnce<T>(url, retry.timeoutMs);
    } catch (err: any) {
      lastErr = err;

      const status = err?.status as number | undefined;
      const retriable =
        status === undefined || status === 429 || (status >= 500 && status <= 599);

      if (!retriable || attempt === retry.maxRetries) break;

      const delay = jitterDelay(retry.baseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
      attempt++;
    }
  }

  throw lastErr;
}

async function fetchJsonOnce<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });

    const text = await resp.text();

    if (!resp.ok) {
      const e: any = new Error(`Upstream request failed: ${resp.status}`);
      e.status = resp.status;
      e.bodySnippet = text.slice(0, 300);
      throw e;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      const e: any = new Error("Upstream returned non-JSON response.");
      e.status = resp.status;
      e.bodySnippet = text.slice(0, 300);
      throw e;
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      const e: any = new Error(`Request timed out after ${timeoutMs}ms.`);
      e.status = undefined;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterDelay(ms: number): number {
  const jitter = 0.2;
  const delta = ms * jitter;
  return Math.max(0, Math.round(ms - delta + Math.random() * 2 * delta));
}
