import { COLLECTIONS } from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';
import { invalidatePantryCaches, pantryByIdCache } from '../cache/pantryCaches';
import { PantryDocument } from '../models/pantry.schema';

/**
 * Manual cache eviction for the admin. Admin writes already invalidate on their
 * own; this is for writes the API didn't see — mainly local crawler runs, whose
 * process can't reach the API's in-memory cache.
 */
export class PantryCacheService {
  /** @returns false when the pantry doesn't exist (its detail entry is still dropped). */
  public async evict(pantryId: string): Promise<boolean> {
    const snap = await db.collection(COLLECTIONS.pantries).doc(pantryId).get();
    if (!snap.exists) {
      await pantryByIdCache().delete(pantryId);
      return false;
    }
    const pantry = snap.data() as PantryDocument;
    await invalidatePantryCaches({ id: pantryId, state: pantry.state, city: pantry.city });
    return true;
  }
}
