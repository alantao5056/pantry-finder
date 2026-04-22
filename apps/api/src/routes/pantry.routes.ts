import { Router } from 'express';
import { PantryController } from '../controllers/pantry.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const pantryController = new PantryController();

router.get('/', requireAuth, pantryController.getPantries.bind(pantryController));

export default router;
