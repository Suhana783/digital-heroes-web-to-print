import { Router } from 'express';
import { patchProfile, readOrders, readProfile } from '../controllers/accountController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateProfileUpdate } from '../validators/accountValidators.js';

const router = Router();
router.use(requireAuth);
router.get('/profile', readProfile);
router.patch('/profile', validateProfileUpdate, patchProfile);
router.get('/orders', readOrders);

export default router;
