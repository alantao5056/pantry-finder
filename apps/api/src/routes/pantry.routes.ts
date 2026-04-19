import { Router } from 'express';
import { PantryController } from '../controllers/pantry.controller';

const router = Router();
const pantryController = new PantryController();

router.get('/', pantryController.getPantries.bind(pantryController));

export default router;
