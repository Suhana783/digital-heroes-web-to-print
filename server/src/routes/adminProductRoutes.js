import { Router } from 'express';
import { patchProductStatus } from '../controllers/adminProductController.js';

const router = Router();
router.patch('/:productId/status', (request, response, next) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.params.productId)) {
    return response.status(400).json({ success: false, message: 'A valid product ID is required' });
  }
  next();
}, patchProductStatus);

export default router;
