import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';

// Everything under /admin is for apps/admin and requires an admin account.
const router = Router();
const adminController = new AdminController();

router.use(requireAdmin);

router.get('/me', adminController.me.bind(adminController));
router.get('/review-items', adminController.listReviewItems.bind(adminController));
router.get('/review-items/:id', adminController.getReviewItem.bind(adminController));
router.delete('/review-items/:id', adminController.deleteReviewItem.bind(adminController));
router.get('/review-items/:id/submission', adminController.getSubmissionReview.bind(adminController));
router.post('/review-items/:id/approve-submission', adminController.approveSubmission.bind(adminController));
router.post('/review-items/:id/reject', adminController.rejectReviewItem.bind(adminController));
router.get('/review-items/:id/mapping', adminController.getMappingReview.bind(adminController));
router.post('/review-items/:id/confirm-mapping', adminController.confirmMapping.bind(adminController));
router.get('/review-items/:id/suspicious', adminController.getSuspiciousReview.bind(adminController));
router.post('/review-items/:id/approve-value', adminController.approveValue.bind(adminController));
router.get('/crawl-runs', adminController.listCrawlRuns.bind(adminController));
router.post('/crawl-runs', adminController.startCrawlRun.bind(adminController));
router.get('/crawl-runs/:id', adminController.getCrawlRun.bind(adminController));
router.get('/crawl-runs/:id/log', adminController.getCrawlRunLog.bind(adminController));
router.post('/crawl-runs/:id/abort', adminController.abortCrawlRun.bind(adminController));
router.post('/crawl-runs/:id/revert', adminController.revertRun.bind(adminController));
router.get('/changes', adminController.listChanges.bind(adminController));
router.post('/changes/:id/revert', adminController.revertChange.bind(adminController));
router.post('/pantries/:id/evict-cache', adminController.evictPantryCache.bind(adminController));
router.get('/llm-evals',adminController.listLlmEvals.bind(adminController));
router.get('/llm-evals/:id', adminController.getLlmEval.bind(adminController));
router.post('/llm-evals/:id/items/:itemId/grade', adminController.gradeLlmEval.bind(adminController));

export default router;
