import { db } from '../config/firebase';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HeartDocument } from '../models/heart.schema';

export class HeartsService {
  private heartsCol = db.collection('hearts');
  private pantriesCol = db.collection('pantries');

  private heartDocId(userId: string, pantryId: string): string {
    return `${userId}_${pantryId}`;
  }

  async heart(userId: string, pantryId: string): Promise<void> {
    const heartRef = this.heartsCol.doc(this.heartDocId(userId, pantryId));
    const pantryRef = this.pantriesCol.doc(pantryId);

    await db.runTransaction(async (tx) => {
      const heartSnap = await tx.get(heartRef);
      if (heartSnap.exists) return;

      const heartDoc: HeartDocument = { userId, pantryId, heartedAt: Timestamp.now() };
      tx.set(heartRef, heartDoc);
      tx.update(pantryRef, { heartCount: FieldValue.increment(1) });
    });
  }

  async unheart(userId: string, pantryId: string): Promise<void> {
    const heartRef = this.heartsCol.doc(this.heartDocId(userId, pantryId));
    const pantryRef = this.pantriesCol.doc(pantryId);

    await db.runTransaction(async (tx) => {
      const heartSnap = await tx.get(heartRef);
      if (!heartSnap.exists) return;

      tx.delete(heartRef);
      tx.update(pantryRef, { heartCount: FieldValue.increment(-1) });
    });
  }

  async getHeartedPantryIds(userId: string): Promise<string[]> {
    const snap = await this.heartsCol.where('userId', '==', userId).get();
    return snap.docs.map((doc) => (doc.data() as HeartDocument).pantryId);
  }
}
