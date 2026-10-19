import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { db, geoFirestore } from '../config/firebase';
import { pantryByIdCache, searchResultsCache, SearchHit } from '../cache/pantryCaches';
import { GeoService } from './geo.service';
import { searchLogService } from './search-log.service';
import { mapPantryDocumentToDto } from '../utils/pantry.mapper';
import { milesToKilometers } from '../utils/distance.util';
import { PantryDocument } from '../models/pantry.schema';
import { SearchLogContext } from '../models/search-log.schema';
import { Pantry } from '@pantry-finder/shared';
import { GetPantriesRequestDto } from '../models/dto/pantry.request.dto';
import { GetPantriesResponseDto } from '../models/dto/pantry.response.dto';

export class PantryService {
  private readonly geoService = new GeoService();

  // Pantry data changes rarely, so cache detail lookups by doc id. Note this
  // also holds heartCount, which can lag up to the TTL behind heart/unheart —
  // and with the Redis backend that lag survives restarts too. Admin and
  // crawler writes invalidate it (see cache/pantryCaches.ts).
  private readonly pantryByIdCache = pantryByIdCache();

  // Search results: pantry ids + distances only.
  private readonly searchResultsCache = searchResultsCache();

  /**
   * Searches for pantries within a specified radius of a location (street address or US zipcode).
   * Returns every match, sorted by distance.
   * @param dto The request DTO containing location and radius.
   * @param searcher Who is searching: the account email when logged in (null
   *   otherwise) plus the anonymous client id. Every search is recorded in the
   *   `search_logs` collection.
   * @returns A response DTO with pantries, or null if location is not found.
   */
  public async getPantriesByLocation(
    dto: GetPantriesRequestDto,
    searcher?: SearchLogContext
  ): Promise<GetPantriesResponseDto | null> {
    const input = dto.location.trim();
    const coordinates = await this.geoService.geocodeLocation(input);

    if (!coordinates) {
      return null;
    }

    const cacheKey = `${coordinates.latitude.toFixed(5)},${coordinates.longitude.toFixed(5)}:${dto.radius}`;
    const hits = await this.searchResultsCache.get(cacheKey);
    const pantries = hits
      ? await this.loadSearchHits(hits)
      : await this.searchNear(coordinates.latitude, coordinates.longitude, dto.radius, cacheKey);

    // Logged whenever we know who is asking — which, thanks to the client-id
    // cookie, is every search, signed in or not.
    if (searcher?.clientId) {
      searchLogService.logSearch({
        userEmail: searcher.userEmail,
        clientId: searcher.clientId,
        location: input,
        radiusMiles: dto.radius,
        totalResults: pantries.length,
        searchedAt: Timestamp.now(),
      });
    }

    return { pantries };
  }

  /** Radius query; caches the results and each pantry. */
  private async searchNear(
    latitude: number,
    longitude: number,
    radiusMiles: number,
    cacheKey: string
  ): Promise<Pantry[]> {
    const snapshot = await geoFirestore
      .collection('pantries')
      .near({ center: new GeoPoint(latitude, longitude), radius: milesToKilometers(radiusMiles) })
      .get();

    // `distance` (km) is added by GeoFirestore.
    const sortedDocs = snapshot.docs.sort(
      (a, b) => ((a as any).distance ?? Infinity) - ((b as any).distance ?? Infinity)
    );

    const pantries = sortedDocs.map((doc) => {
      const data = doc.data() as unknown as PantryDocument;
      return mapPantryDocumentToDto(data, doc.id, (doc as any).distance as number | undefined);
    });

    await Promise.all([
      this.searchResultsCache.set(
        cacheKey,
        pantries.map(({ id, distance }) => ({ id, distance }))
      ),
      ...pantries.map(({ distance, ...pantry }) => this.pantryByIdCache.set(pantry.id, pantry)),
    ]);
    return pantries;
  }

  /** Cached hits → pantries; Firestore fills cache misses. */
  private async loadSearchHits(hits: SearchHit[]): Promise<Pantry[]> {
    const cached = await Promise.all(hits.map((hit) => this.pantryByIdCache.get(hit.id)));

    const missingIds = hits.filter((_, i) => cached[i] == null).map((hit) => hit.id);
    const fetched = new Map<string, Pantry>();
    if (missingIds.length > 0) {
      const snapshots = await db.getAll(...missingIds.map((id) => db.collection('pantries').doc(id)));
      for (const snapshot of snapshots) {
        if (!snapshot.exists) continue;
        const pantry = mapPantryDocumentToDto(snapshot.data() as PantryDocument, snapshot.id);
        fetched.set(snapshot.id, pantry);
      }
      await Promise.all([...fetched].map(([id, pantry]) => this.pantryByIdCache.set(id, pantry)));
    }

    return hits.flatMap((hit, i) => {
      const pantry = cached[i] ?? fetched.get(hit.id);
      return pantry ? [{ ...pantry, distance: hit.distance }] : [];
    });
  }

  /**
   * Fetches a single pantry by its Firestore document id.
   * A plain Firestore doc lookup is enough here — GeoFirestore stores pantry
   * fields flat (with only an extra `g` geohash field that the mapper ignores),
   * so this returns the same shape as the search path without the geo wrapper.
   * Matches how hearts.service reads this collection.
   * @param id The pantry document id.
   * @returns The mapped pantry DTO, or null if no document exists.
   */
  public async getPantryById(id: string): Promise<Pantry | null> {
    const cached = await this.pantryByIdCache.get(id);
    if (cached != null) {
      return cached;
    }

    const snapshot = await db.collection('pantries').doc(id).get();

    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as PantryDocument;
    const pantry = mapPantryDocumentToDto(data, snapshot.id);
    await this.pantryByIdCache.set(id, pantry);
    return pantry;
  }
}
