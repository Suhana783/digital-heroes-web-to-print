import { Router } from 'express';
import { createOrder, getOrder, listOrders } from '../controllers/orderController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCreateOrder, validateOrderId } from '../validators/orderValidators.js';
import { getOrderArtwork, uploadArtwork } from '../controllers/artworkController.js';
import { parseArtworkForm } from '../middleware/parseArtworkForm.js';
import { getCustomerProofDownload, getCustomerProofs, postCustomerProofResponse } from '../controllers/proofController.js';
import { validateProofId, validateProofResponse } from '../validators/proofValidators.js';

const router = Router();
router.use(requireAuth);
router.post('/', validateCreateOrder, createOrder);
router.post('/:orderId/artwork', validateOrderId, parseArtworkForm, uploadArtwork);
router.get('/:orderId/artwork', validateOrderId, getOrderArtwork);
router.get('/:orderId/proofs', validateOrderId, getCustomerProofs);
router.post('/proofs/:proofId/respond', validateProofId, validateProofResponse, postCustomerProofResponse);
router.get('/proofs/:proofId/download', validateProofId, getCustomerProofDownload);
router.get('/', listOrders);
router.get('/:orderId', validateOrderId, getOrder);

export default router;
