import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';

// Everything under /admin is for apps/admin and requires an admin account.
const router = Router();
const adminController = new AdminController();

router.use(requireAdmin);

router.get('/me', adminController.me.bind(adminController));
router.get('/review-items', adminController.listReviewItems.bind(adminController));
router.get('/review-items/:id/submission', adminController.getSubmissionReview.bind(adminController));
router.post('/review-items/:id/approve-submission', adminController.approveSubmission.bind(adminController));
router.post('/review-items/:id/reject', adminController.rejectReviewItem.bind(adminController));
router.get('/crawl-runs', adminController.listCrawlRuns.bind(adminController));

export default router;
