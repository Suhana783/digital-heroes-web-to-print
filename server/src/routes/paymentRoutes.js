import { Router } from 'express';
import {
  getPaymentStatus,
  postCreatePaymentOrder,
  postPaymentFailure,
  postSimulateMockPayment,
  postVerifyPayment,
} from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  validateCreatePaymentOrder,
  validateMockSimulation,
  validatePaymentStatusOrder,
  validateRazorpayFailure,
  validateRazorpayPaymentVerification,
} from '../validators/paymentValidators.js';

const router = Router();
router.use(requireAuth);
router.post('/create-order', validateCreatePaymentOrder, postCreatePaymentOrder);
router.post('/verify', validateRazorpayPaymentVerification, postVerifyPayment);
router.post('/mock/simulate', validateMockSimulation, postSimulateMockPayment);
router.post('/failure', validateRazorpayFailure, postPaymentFailure);
router.get('/:orderId/status', validatePaymentStatusOrder, getPaymentStatus);

export default router;
