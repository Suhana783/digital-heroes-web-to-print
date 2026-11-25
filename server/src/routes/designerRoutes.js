import { Router } from 'express';
import {
  getAvailableProductTemplates,
  getDesign,
  getDesignAssetDownload,
  getDesignerProducts,
  getMyDesigns,
  postDesign,
  postDesignAsset,
  putDesign,
  removeDesign,
} from '../controllers/designerController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { parseDesignAssetForm } from '../middleware/parseDesignAssetForm.js';
import { validateDesignerId } from '../validators/designerValidators.js';

const router = Router();
router.get('/products', getDesignerProducts);
router.get('/templates', getAvailableProductTemplates);
router.use(requireAuth);
router.get('/designs', getMyDesigns);
router.post('/designs', postDesign);
router.get('/designs/:designId', validateDesignerId, getDesign);
router.put('/designs/:designId', validateDesignerId, putDesign);
router.delete('/designs/:designId', validateDesignerId, removeDesign);
router.post('/designs/:designId/assets', validateDesignerId, parseDesignAssetForm, postDesignAsset);
router.get('/designs/:designId/assets/:assetId/download', validateDesignerId, getDesignAssetDownload);

export default router;
