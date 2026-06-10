import { LRUCache } from 'lru-cache';
import {
  slugify,
  isValidStateSlug,
  Pantry,
  CitySummary,
  StateSummary,
  GetCityPantriesResponseDto,
} from '@pantry-finder/shared';
import { db } from '../config/firebase';
import { mapPantryDocumentToDto } from '../utils/pantry.mapper';
import { PantryDocument } from '../models/pantry.schema';
import { CITY_PAGE_SIZE } from '../config/constants';

// One covered city as derived from the pantry docs. `variants` keeps every raw
// (city, state) string pair that collapsed into this slug — Firestore stores
// city names as-is (mixed casing/punctuation), so by-city queries must use the
// exact stored values rather than the slug.
interface CityIndexEntry {
  city: string;
  state: string;
  citySlug: string;
  stateSlug: string;
  pantryCount: number;
  variants: { city: string; state: string }[];
}

interface CitiesIndex {
  byKey: Map<string, CityIndexEntry>;
  cities: CitySummary[];
  states: StateSummary[];
}

const INDEX_KEY = 'all';

export class CityService {
  // Single-entry cache: building the index reads every pantry doc (city/state
  // fields only), so refresh at most once per day.
  private readonly indexCache = new LRUCache<string, CitiesIndex>({
    max: 1,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Full (unpaginated) pantry list per city, keyed by `${stateSlug}|${citySlug}`.
  private readonly cityPantriesCache = new LRUCache<string, Pantry[]>({
    max: 500,
    ttl: 60 * 60 * 1000, // 1 hour
  });

  // Coalesces concurrent index builds so a burst of cold requests triggers a
  // single Firestore scan.
  private indexPromise: Promise<CitiesIndex> | null = null;

  public async getStates(): Promise<StateSummary[]> {
    const index = await this.getIndex();
    return index.states;
  }

  public async getCities(stateSlug: string, limit?: number): Promise<CitySummary[] | null> {
    const index = await this.getIndex();

    let cities = index.cities.filter((c) => c.stateSlug === stateSlug);
    if (cities.length === 0) {
      return null;
    }
    if (limit !== undefined) {
      cities = cities.slice(0, limit);
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
    const index = await this.getIndex();
    const entry = index.byKey.get(`${stateSlug}|${citySlug}`);

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

  private async fetchCityPantries(entry: CityIndexEntry): Promise<Pantry[]> {
    const key = `${entry.stateSlug}|${entry.citySlug}`;
    const cached = this.cityPantriesCache.get(key);
    if (cached !== undefined) {
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
    this.cityPantriesCache.set(key, pantries);
    return pantries;
  }

  private getIndex(): Promise<CitiesIndex> {
    const cached = this.indexCache.get(INDEX_KEY);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    if (this.indexPromise === null) {
      this.indexPromise = this.buildIndex()
        .then((index) => {
          this.indexCache.set(INDEX_KEY, index);
          return index;
        })
        .finally(() => {
          this.indexPromise = null;
        });
    }
    return this.indexPromise;
  }

  private async buildIndex(): Promise<CitiesIndex> {
    const snapshot = await db.collection('pantries').select('city', 'state').get();

    // Track how often each raw casing appears so the most common form becomes
    // the display value.
    const entries = new Map<
      string,
      { entry: CityIndexEntry; cityCasings: Map<string, number> }
    >();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const city = typeof data.city === 'string' ? data.city.trim() : '';
      const state = typeof data.state === 'string' ? data.state.trim() : '';
      const citySlug = slugify(city);
      const stateSlug = state.toLowerCase();
      // isValidStateSlug keeps dirty state codes (e.g. "HA") out of the index;
      // the sitemap generator applies the same gate so every emitted landing
      // URL resolves here.
      if (!citySlug || !isValidStateSlug(stateSlug)) {
        continue;
      }

      const key = `${stateSlug}|${citySlug}`;
      let record = entries.get(key);
      if (!record) {
        record = {
          entry: {
            city,
            state: state.toUpperCase(),
            citySlug,
            stateSlug,
            pantryCount: 0,
            variants: [],
          },
          cityCasings: new Map(),
        };
        entries.set(key, record);
      }

      record.entry.pantryCount += 1;
      record.cityCasings.set(city, (record.cityCasings.get(city) ?? 0) + 1);
      if (!record.entry.variants.some((v) => v.city === city && v.state === state)) {
        record.entry.variants.push({ city, state });
      }
    }

    const byKey = new Map<string, CityIndexEntry>();
    const stateAgg = new Map<string, StateSummary>();

    for (const [key, { entry, cityCasings }] of entries) {
      entry.city = [...cityCasings.entries()].sort((a, b) => b[1] - a[1])[0][0];
      byKey.set(key, entry);

      const stateSummary = stateAgg.get(entry.stateSlug) ?? {
        state: entry.state,
        stateSlug: entry.stateSlug,
        cityCount: 0,
        pantryCount: 0,
      };
      stateSummary.cityCount += 1;
      stateSummary.pantryCount += entry.pantryCount;
      stateAgg.set(entry.stateSlug, stateSummary);
    }

    const cities: CitySummary[] = [...byKey.values()]
      .map(({ city, state, citySlug, stateSlug, pantryCount }) => ({
        city,
        state,
        citySlug,
        stateSlug,
        pantryCount,
      }))
      .sort((a, b) => b.pantryCount - a.pantryCount);

    const states = [...stateAgg.values()].sort((a, b) => a.state.localeCompare(b.state));

    return { byKey, cities, states };
  }
}
