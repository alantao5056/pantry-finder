import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const authController = new AuthController();

router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/google', authController.googleLogin.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.get('/me', requireAuth, authController.me.bind(authController));

export default router;
