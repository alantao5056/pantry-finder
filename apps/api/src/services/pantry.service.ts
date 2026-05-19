import { GeoPoint } from 'firebase-admin/firestore';
import { geoFirestore } from '../config/firebase';
import { GeoService } from './geo.service';
import { mapPantryDocumentToDto } from '../utils/pantry.mapper';
import { milesToKilometers } from '../utils/distance.util';
import { PantryDocument } from '../models/pantry.schema';
import { Pantry } from '@pantry-finder/types';
import { PAGE_SIZE } from '../config/constants';
import { GetPantriesRequestDto } from '../models/dto/pantry.request.dto';
import { GetPantriesResponseDto } from '../models/dto/pantry.response.dto';

const ZIPCODE_RE = /^\d{5}(?:-\d{4})?$/;

function isZipcode(input: string): boolean {
  return ZIPCODE_RE.test(input);
}

export class PantryService {
  private readonly geoService = new GeoService();

  /**
   * Searches for pantries within a specified radius of a location (street address or US zipcode).
   * @param dto The request DTO containing location, radius, and page.
   * @returns A response DTO with pantries and pagination, or null if location is not found.
   */
  public async getPantriesByLocation(
    dto: GetPantriesRequestDto
  ): Promise<GetPantriesResponseDto | null> {
    const input = dto.location.trim();
    const coordinates = isZipcode(input)
      ? await this.geoService.geocodeZipcode(input)
      : await this.geoService.geocodeAddress(input);

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
}
