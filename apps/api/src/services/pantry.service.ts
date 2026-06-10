import { GeoPoint } from 'firebase-admin/firestore';
import { LRUCache } from 'lru-cache';
import { db, geoFirestore } from '../config/firebase';
import { GeoService } from './geo.service';
import { mapPantryDocumentToDto } from '../utils/pantry.mapper';
import { milesToKilometers } from '../utils/distance.util';
import { PantryDocument } from '../models/pantry.schema';
import { Pantry } from '@pantry-finder/shared';
import { PAGE_SIZE } from '../config/constants';
import { GetPantriesRequestDto } from '../models/dto/pantry.request.dto';
import { GetPantriesResponseDto } from '../models/dto/pantry.response.dto';

export class PantryService {
  private readonly geoService = new GeoService();

  // Pantry data changes rarely, so cache detail lookups by doc id. Note this
  // also holds heartCount, which can lag up to the TTL behind heart/unheart.
  private readonly pantryByIdCache = new LRUCache<string, Pantry>({
    max: 10000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  });

  /**
   * Searches for pantries within a specified radius of a location (street address or US zipcode).
   * @param dto The request DTO containing location, radius, and page.
   * @returns A response DTO with pantries and pagination, or null if location is not found.
   */
  public async getPantriesByLocation(
    dto: GetPantriesRequestDto
  ): Promise<GetPantriesResponseDto | null> {
    const input = dto.location.trim();
    const coordinates = await this.geoService.geocodeLocation(input);

    if (!coordinates) {
      return null;
    }

    const radiusKm = milesToKilometers(dto.radius);
    const center = new GeoPoint(coordinates.latitude, coordinates.longitude);

    const pantriesRef = geoFirestore.collection('pantries');
    
    // GeoFirestore query
    const query = pantriesRef.near({
      center: center,
      radius: radiusKm,
    });

    const snapshot = await query.get();

    // GeoFirestore adds a `distance` property to each document snapshot.
    // We can use this to guarantee the results are strictly sorted by distance.
    const sortedDocs = snapshot.docs.sort((a, b) => {
      // Cast to any to access the 'distance' property added by GeoFirestore
      const distA = (a as any).distance ?? Infinity;
      const distB = (b as any).distance ?? Infinity;
      return distA - distB;
    });

    // In-memory pagination
    const startIndex = (dto.page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;

    const paginatedDocs = sortedDocs.slice(startIndex, endIndex);
    const hasNextPage = sortedDocs.length > endIndex;
    
    const paginatedPantries: Pantry[] = paginatedDocs.map((doc) => {
      const data = doc.data() as unknown as PantryDocument;
      const distanceKm = (doc as any).distance as number | undefined;
      return mapPantryDocumentToDto(data, doc.id, distanceKm);
    });

    return {
      pantries: paginatedPantries,
      pagination: {
        page: dto.page,
        pageSize: PAGE_SIZE,
        hasNextPage: hasNextPage,
        nextPage: hasNextPage ? dto.page + 1 : undefined,
      }
    };
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
    const cached = this.pantryByIdCache.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const snapshot = await db.collection('pantries').doc(id).get();

    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as PantryDocument;
    const pantry = mapPantryDocumentToDto(data, snapshot.id);
    this.pantryByIdCache.set(id, pantry);
    return pantry;
  }
}
