import { db } from '../config/firebase';
import { SearchLogDocument } from '../models/search-log.schema';

export class SearchLogService {
  private readonly searchLogsCol = db.collection('search_logs');

  /**
   * Persists one search-log entry. Fire-and-forget: the write is not awaited
   * and failures are only logged, so a slow or failing Firestore write never
   * blocks or fails the search request itself.
   */
  public logSearch(entry: SearchLogDocument): void {
    this.searchLogsCol.add(entry).catch((err) => {
      console.error('Failed to write search log', err);
    });
  }
}

export const searchLogService = new SearchLogService();
