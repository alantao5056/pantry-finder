import {
  Pantry,
  CitySummary,
  StateSummary,
  CityIndexDocument,
  StateIndexDocument,
  GetCityPantriesResponseDto,
} from '@pantry-finder/shared';
import { db } from '../config/firebase';
import { createCache } from '../cache/createCache';
import { mapPantryDocumentToDto } from '../utils/pantry.mapper';
import { PantryDocument } from '../models/pantry.schema';
import { CITY_PAGE_SIZE } from '../config/constants';

// The browse index lives in the precomputed `states`/`cities` Firestore
// collections, written by the sitemap tool (tools/sitemap) from a single scan
// of the pantries collection. This service only ever reads those small
// collections — never scan `pantries` here: at ~14k docs a full scan burns a
// third of the free-tier daily read quota per cold start.
const INDEX_TTL = 48 * 60 * 60 * 1000; // 48 hours

const STATES_KEY = 'all';

export class CityService {
  private readonly statesCache = createCache<StateSummary[]>('pf:city:states:', {
    ttlMs: INDEX_TTL,
    max: 1,
  });

  // All cities of one state, sorted by pantryCount desc, keyed by stateSlug.
  private readonly citiesByStateCache = createCache<CitySummary[]>('pf:city:list:', {
    ttlMs: INDEX_TTL,
    max: 60,
  });

  // One `cities` doc per covered city, keyed by its doc ID
  // `${stateSlug}_${citySlug}`. Misses are cached too (as null) so repeated
  // requests for nonexistent cities (bots, dead links) don't each cost a
  // Firestore read.
  private readonly cityEntryCache = createCache<CityIndexDocument>('pf:city:entry:', {
    ttlMs: INDEX_TTL,
    max: 4000,
  });

  // Full (unpaginated) pantry list per city, keyed by `${stateSlug}_${citySlug}`.
  private readonly cityPantriesCache = createCache<Pantry[]>('pf:city:pantries:', {
    ttlMs: INDEX_TTL,
    max: 4000,
  });

  // Coalesces concurrent fetches per cache key so a burst of cold requests
  // triggers a single cache read + at most one Firestore query. The cache
  // reads happen inside the coalesced function because they're async now.
  private readonly pending = new Map<string, Promise<unknown>>();

  public getStates(): Promise<StateSummary[]> {
    return this.coalesce(`states:${STATES_KEY}`, async () => {
      const cached = await this.statesCache.get(STATES_KEY);
      if (cached != null) {
        return cached;
      }
      const snapshot = await db.collection('states').get();
      if (snapshot.empty) {
        console.warn(
          'states collection is empty — run the sitemap tool (npm run generate:prod in tools/sitemap) to build the browse index.'
        );
      }
      const states = snapshot.docs
        .map((doc) => toStateSummary(doc.data() as StateIndexDocument))
        .sort((a, b) => a.state.localeCompare(b.state));
      await this.statesCache.set(STATES_KEY, states);
      return states;
    });
  }

  public async getCities(stateSlug: string, limit?: number): Promise<CitySummary[] | null> {
    const cities = await this.fetchStateCities(stateSlug);
    if (cities.length === 0) {
      return null;
    }
    if (limit !== undefined) {
      return cities.slice(0, limit);
    }
    return cities;
  }

  /**
   * All pantries in one city, paginated in memory.
   * @returns null if the (state, city) slug pair isn't a covered city, or if
   * the page is out of range.
   */
  public async getCityPantries(
    stateSlug: string,
    citySlug: string,
    page: number
  ): Promise<GetCityPantriesResponseDto | null> {
    const entry = await this.fetchCityEntry(stateSlug, citySlug);

    if (!entry) {
      return null;
    }

    const pantries = await this.fetchCityPantries(entry);
    const totalPages = Math.max(1, Math.ceil(pantries.length / CITY_PAGE_SIZE));
    if (page > totalPages) {
      return null;
    }

    const startIndex = (page - 1) * CITY_PAGE_SIZE;
    return {
      city: entry.city,
      state: entry.state,
      pantryCount: pantries.length,
      page,
      pageSize: CITY_PAGE_SIZE,
      totalPages,
      pantries: pantries.slice(startIndex, startIndex + CITY_PAGE_SIZE),
    };
  }

  private fetchStateCities(stateSlug: string): Promise<CitySummary[]> {
    return this.coalesce(`cities:${stateSlug}`, async () => {
      const cached = await this.citiesByStateCache.get(stateSlug);
      if (cached != null) {
        return cached;
      }
      // A state's cities fit in one small query (a few hundred docs at most);
      // sorting in memory avoids needing a composite Firestore index.
      const snapshot = await db
        .collection('cities')
        .where('stateSlug', '==', stateSlug)
        .get();
      const cities = snapshot.docs
        .map((doc) => toCitySummary(doc.data() as CityIndexDocument))
        .sort((a, b) => b.pantryCount - a.pantryCount);
      await this.citiesByStateCache.set(stateSlug, cities);
      return cities;
    });
  }

  private fetchCityEntry(stateSlug: string, citySlug: string): Promise<CityIndexDocument | null> {
    const key = `${stateSlug}_${citySlug}`;
    return this.coalesce(`city:${key}`, async () => {
      const cached = await this.cityEntryCache.get(key);
      if (cached !== undefined) {
        return cached; // null = known-missing city
      }
      const doc = await db.collection('cities').doc(key).get();
      const entry = doc.exists ? (doc.data() as CityIndexDocument) : null;
      await this.cityEntryCache.set(key, entry);
      return entry;
    });
  }

  private fetchCityPantries(entry: CityIndexDocument): Promise<Pantry[]> {
    const key = `${entry.stateSlug}_${entry.citySlug}`;
    return this.coalesce(`pantries:${key}`, async () => {
      const cached = await this.cityPantriesCache.get(key);
      if (cached != null) {
        return cached;
      }
      // Almost always a single variant; dirty data (e.g. "St. Louis" vs
      // "St Louis") yields a few exact-match queries merged by doc id.
      const byId = new Map<string, Pantry>();
      for (const variant of entry.variants) {
        const snapshot = await db
          .collection('pantries')
          .where('state', '==', variant.state)
          .where('city', '==', variant.city)
          .get();
        for (const doc of snapshot.docs) {
          byId.set(doc.id, mapPantryDocumentToDto(doc.data() as PantryDocument, doc.id));
        }
      }

      const pantries = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
      await this.cityPantriesCache.set(key, pantries);
      return pantries;
    });
  }

  private coalesce<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }
    const promise = fetch().finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }
}

// The index docs carry extra fields (variants, updatedAt); strip them down to
// the shared wire shapes so internals never leak into API responses.
function toStateSummary({ state, stateSlug, cityCount, pantryCount }: StateIndexDocument): StateSummary {
  return { state, stateSlug, cityCount, pantryCount };
}

function toCitySummary({ city, state, citySlug, stateSlug, pantryCount }: CityIndexDocument): CitySummary {
  return { city, state, citySlug, stateSlug, pantryCount };
}
