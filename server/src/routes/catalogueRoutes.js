import { Router } from 'express';
import { getDivisionProduct, listDivisionProducts, listDivisions } from '../controllers/catalogueController.js';
import { validateDivisionSlug, validateProductSlugs } from '../validators/catalogueValidators.js';

const router = Router();

router.get('/divisions', listDivisions);
router.get('/divisions/:divisionSlug/products', validateDivisionSlug, listDivisionProducts);
router.get('/divisions/:divisionSlug/products/:productSlug', validateProductSlugs, getDivisionProduct);

export default router;
