import { Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_APP_CONFIG, MAX_CACHE_TTL_MINUTES, MIN_CACHE_TTL_MINUTES } from '@pantry-finder/shared';
import type { AppConfig, AppConfigResponse, CacheTtlMinutes } from '@pantry-finder/shared';
import { db } from '../config/firebase';
import { APP_CONFIG_TTL_MS } from '../config/constants';

// Runtime settings, edited from the admin's Settings page or by hand in the
// Firebase console (no deploy needed):
//   appConfig/search → { anonymousSearchEnabled: boolean }
//   appConfig/cache  → { ttlMinutes: { geocode, pantry, cityState, user } }
// A missing doc/field means its default (DEFAULT_APP_CONFIG). Changes take
// effect within APP_CONFIG_TTL_MS.
const APP_CONFIG_COLLECTION = 'appConfig';
const SEARCH_DOC = 'search';
const CACHE_DOC = 'cache';

const searchRef = () => db.collection(APP_CONFIG_COLLECTION).doc(SEARCH_DOC);
const cacheRef = () => db.collection(APP_CONFIG_COLLECTION).doc(CACHE_DOC);

type CacheDoc = {
  ttlMinutes?: Partial<Record<keyof CacheTtlMinutes, unknown>>;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export function isValidTtlMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_CACHE_TTL_MINUTES &&
    value <= MAX_CACHE_TTL_MINUTES
  );
}

function toCacheTtlMinutes(raw: Partial<Record<keyof CacheTtlMinutes, unknown>> | undefined): CacheTtlMinutes {
  const defaults = DEFAULT_APP_CONFIG.cacheTtlMinutes;
  const valid = (value: unknown, fallback: number) => (isValidTtlMinutes(value) ? value : fallback);
  return {
    geocode: valid(raw?.geocode, defaults.geocode),
    pantry: valid(raw?.pantry, defaults.pantry),
    cityState: valid(raw?.cityState, defaults.cityState),
    user: valid(raw?.user, defaults.user),
  };
}

async function fetchAppConfig(): Promise<AppConfigResponse> {
  const [search, cache] = await db.getAll(searchRef(), cacheRef());
  const cacheDoc = cache!.data() as CacheDoc | undefined;
  return {
    config: {
      anonymousSearchEnabled: search!.data()?.anonymousSearchEnabled !== false,
      cacheTtlMinutes: toCacheTtlMinutes(cacheDoc?.ttlMinutes),
    },
    updatedAt: cacheDoc?.updatedAt?.toDate().toISOString(),
    updatedBy: cacheDoc?.updatedBy,
  };
}

let cached: { value: AppConfig; fetchedAt: number } | null = null;
// Coalesces the reads of concurrent requests that all find the snapshot expired.
let pending: Promise<AppConfig> | null = null;

export function getAppConfig(): Promise<AppConfig> {
  if (cached && Date.now() - cached.fetchedAt < APP_CONFIG_TTL_MS) {
    return Promise.resolve(cached.value);
  }

  pending ??= fetchAppConfig()
    .then((res) => res.config)
    .catch((err) => {
      // Fail open to the defaults. Cached below too, so an outage costs one
      // read per TTL rather than one per request.
      console.error('Failed to read appConfig, using the defaults:', err);
      return DEFAULT_APP_CONFIG;
    })
    .then((value) => {
      cached = { value, fetchedAt: Date.now() };
      pending = null;
      return value;
    });
  return pending;
}

export async function isAnonymousSearchEnabled(): Promise<boolean> {
  return (await getAppConfig()).anonymousSearchEnabled;
}

function ttlMs(pick: (ttl: CacheTtlMinutes) => number): () => Promise<number> {
  return async () => pick((await getAppConfig()).cacheTtlMinutes) * 60 * 1000;
}

/** TTL sources for createCache(): resolved on every cache write, so a changed setting applies to new entries. */
export const cacheTtl = {
  geocode: ttlMs((ttl) => ttl.geocode),
  pantry: ttlMs((ttl) => ttl.pantry),
  cityState: ttlMs((ttl) => ttl.cityState),
  user: ttlMs((ttl) => ttl.user),
};

/** The stored settings, read straight from Firestore (admin Settings page). */
export function readAppConfig(): Promise<AppConfigResponse> {
  return fetchAppConfig();
}

export async function updateAppConfig(config: AppConfig, actor: string): Promise<AppConfigResponse> {
  const updatedAt = Timestamp.now();
  const batch = db.batch();
  batch.set(searchRef(), { anonymousSearchEnabled: config.anonymousSearchEnabled }, { merge: true });
  batch.set(cacheRef(), { ttlMinutes: config.cacheTtlMinutes, updatedAt, updatedBy: actor }, { merge: true });
  await batch.commit();

  // This process picks the change up right away; any other reader does within
  // APP_CONFIG_TTL_MS.
  cached = { value: config, fetchedAt: Date.now() };
  return { config, updatedAt: updatedAt.toDate().toISOString(), updatedBy: actor };
}
