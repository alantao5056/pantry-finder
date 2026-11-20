import { Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { CONTACT_MESSAGE_MAX, CONTACT_SUBJECT_MAX, isContactCategory } from '@pantry-finder/shared';
import { AuthedRequest } from '../middleware/auth.middleware';
import { ContactMessageService } from '../services/contact-message.service';
import { UserService } from '../services/user.service';
import { str } from '../utils/validation.util';

const contactMessageService = new ContactMessageService();
const userService = new UserService();

export class ContactController {
  public async submit(req: AuthedRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const category = body.category;
    const subject = str(body.subject, CONTACT_SUBJECT_MAX);
    const message = str(body.message, CONTACT_MESSAGE_MAX);

    const missing: string[] = [];
    if (!isContactCategory(category)) missing.push('category');
    if (!subject) missing.push('subject');
    if (!message) missing.push('message');
    if (missing.length > 0 || !isContactCategory(category)) {
      res.status(400).json({ error: 'Missing or invalid required fields.', fields: missing });
      return;
    }

    try {
      const userEmail = req.user!.sub;
      const profile = await userService.getUserProfile(userEmail);
      const userName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : '';
      const id = await contactMessageService.create({
        category,
        subject,
        message,
        userEmail,
        userName: userName || undefined,
        status: 'new',
        createdAt: Timestamp.now(),
      });
      res.status(201).json({ ok: true, id });
    } catch (error) {
      console.error('Error saving contact message:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
}
