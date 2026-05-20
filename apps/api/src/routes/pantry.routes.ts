import { Router } from 'express';
import { PantryController } from '../controllers/pantry.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { rateLimitSearch } from '../middleware/rateLimit.middleware';

const router = Router();
const pantryController = new PantryController();

router.get('/', optionalAuth, rateLimitSearch, pantryController.getPantries.bind(pantryController));

export default router;
