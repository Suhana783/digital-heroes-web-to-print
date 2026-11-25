import { Router } from 'express';
import { calculateProductPrice } from '../controllers/pricingController.js';
import { validatePricingRequest } from '../validators/pricingValidator.js';

const router = Router();
router.post('/calculate', validatePricingRequest, calculateProductPrice);

export default router;
