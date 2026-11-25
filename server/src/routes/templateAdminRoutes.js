import { Router } from 'express';
import {
  getAdminTemplateProducts,
  getAdminTemplates,
  postAdminTemplate,
  putAdminTemplate,
} from '../controllers/designerController.js';
import { validateDesignerId } from '../validators/designerValidators.js';

const router = Router();
router.get('/', getAdminTemplates);
router.get('/products', getAdminTemplateProducts);
router.post('/', postAdminTemplate);
router.put('/:templateId', validateDesignerId, putAdminTemplate);

export default router;
