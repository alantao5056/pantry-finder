import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimitContact } from '../middleware/rateLimit.middleware';

const router = Router();
const contactController = new ContactController();

router.post('/', requireAuth, rateLimitContact, contactController.submit.bind(contactController));

export default router;
