import { Router } from 'express';
import { checkAdminAccess } from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import proofRoutes from './proofRoutes.js';
import { getProductionOrders, putProductionStage } from '../controllers/adminProductionController.js';
import { validateOrderId } from '../validators/orderValidators.js';
import templateAdminRoutes from './templateAdminRoutes.js';
import adminProductRoutes from './adminProductRoutes.js';
import { getAdminReports } from '../controllers/adminReportController.js';
import { getAdminPaymentAttempts } from '../controllers/adminPaymentController.js';

const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/access-check', checkAdminAccess);
router.get('/reports', getAdminReports);
router.get('/payments', getAdminPaymentAttempts);
router.get('/production/orders', getProductionOrders);
router.put('/production/orders/:orderId/stage', validateOrderId, (request, response, next) => {
  if (!request.body || !['quote', 'order', 'artwork', 'proof', 'production', 'completed'].includes(request.body.stage)) {
    return response.status(400).json({ success: false, message: 'A valid production stage is required' });
  }
  next();
}, putProductionStage);
router.use('/proofs', proofRoutes);
router.use('/templates', templateAdminRoutes);
router.use('/products', adminProductRoutes);

export default router;
