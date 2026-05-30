import { Router } from 'express';
import { PantryController } from '../controllers/pantry.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { rateLimitSearch } from '../middleware/rateLimit.middleware';

const router = Router();
const pantryController = new PantryController();

router.get('/', optionalAuth, rateLimitSearch, pantryController.getPantries.bind(pantryController));

// Single-pantry detail lookup. Auth is optional (anyone can view a pantry) and
// it is intentionally not behind rateLimitSearch so opening details doesn't
// consume a user's search quota.
router.get('/:id', optionalAuth, pantryController.getPantryById.bind(pantryController));

export default router;
