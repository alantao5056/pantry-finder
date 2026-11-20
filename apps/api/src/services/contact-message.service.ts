import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { pruneUndefined, type ContactMessageStatus, type ContactMessageSummary } from '@pantry-finder/shared';
import { db } from '../config/firebase';
import { ContactMessageDocument } from '../models/contact-message.schema';

const PAGE_SIZE = 20;

function toSummary(id: string, m: ContactMessageDocument): ContactMessageSummary {
  return {
    id,
    category: m.category,
    subject: m.subject,
    message: m.message,
    userEmail: m.userEmail,
    userName: m.userName,
    status: m.status,
    createdAt: m.createdAt.toDate().toISOString(),
    readAt: m.readAt?.toDate().toISOString(),
    readBy: m.readBy,
  };
}

export class ContactMessageService {
  private readonly col = db.collection('contact_messages');

  public async create(message: ContactMessageDocument): Promise<string> {
    const ref = this.col.doc();
    await ref.create(pruneUndefined(message));
    return ref.id;
  }

  /** Newest first. `cursor` is the last id of the previous page. */
  public async list(filter: { status?: ContactMessageStatus; cursor?: string }): Promise<{
    messages: ContactMessageSummary[];
    nextCursor?: string;
  }> {
    let query: FirebaseFirestore.Query = this.col;
    if (filter.status) query = query.where('status', '==', filter.status);
    query = query.orderBy('createdAt', 'desc');
    if (filter.cursor) {
      const cursorSnap = await this.col.doc(filter.cursor).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }
    const snapshot = await query.limit(PAGE_SIZE + 1).get();
    const docs = snapshot.docs.slice(0, PAGE_SIZE);
    return {
      messages: docs.map((d) => toSummary(d.id, d.data() as ContactMessageDocument)),
      nextCursor: snapshot.docs.length > PAGE_SIZE ? docs[docs.length - 1].id : undefined,
    };
  }

  /** @returns false if the message doesn't exist. */
  public async setStatus(id: string, status: ContactMessageStatus, adminEmail: string): Promise<boolean> {
    const ref = this.col.doc(id);
    if (!(await ref.get()).exists) return false;
    await ref.update(
      status === 'read'
        ? { status, readAt: Timestamp.now(), readBy: adminEmail }
        : { status, readAt: FieldValue.delete(), readBy: FieldValue.delete() },
    );
    return true;
  }

  public async delete(id: string): Promise<void> {
    await this.col.doc(id).delete();
  }
}
