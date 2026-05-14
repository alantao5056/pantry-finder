import { Router } from 'express';
import { HeartsController } from '../controllers/hearts.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const heartsController = new HeartsController();

router.get('/', requireAuth, heartsController.getHearts.bind(heartsController));
router.post('/:pantryId', requireAuth, heartsController.heart.bind(heartsController));
router.delete('/:pantryId', requireAuth, heartsController.unheart.bind(heartsController));

export default router;
