import { Router } from 'express';
import { PantryController } from '../controllers/pantry.controller';
import { PantrySubmissionController } from '../controllers/pantry-submission.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { rateLimitSearch, rateLimitSubmission } from '../middleware/rateLimit.middleware';

const router = Router();
const pantryController = new PantryController();
const pantrySubmissionController = new PantrySubmissionController();

router.get('/', optionalAuth, rateLimitSearch, pantryController.getPantries.bind(pantryController));

// Public "Add a Pantry" submission → moderation queue. optionalAuth attaches the
// submitter's account when logged in; rateLimitSubmission curbs spam.
router.post(
  '/submissions',
  optionalAuth,
  rateLimitSubmission,
  pantrySubmissionController.submit.bind(pantrySubmissionController)
);

// Single-pantry detail lookup. Auth is optional (anyone can view a pantry) and
// it is intentionally not behind rateLimitSearch so opening details doesn't
// consume a user's search quota.
router.get('/:id', optionalAuth, pantryController.getPantryById.bind(pantryController));

export default router;
