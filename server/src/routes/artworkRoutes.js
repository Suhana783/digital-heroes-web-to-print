import { Router } from 'express';
import { getArtworkDownloadUrl } from '../controllers/artworkController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateArtworkId } from '../validators/artworkValidators.js';

const router = Router();
router.use(requireAuth);
router.get('/:artworkId/download', validateArtworkId, getArtworkDownloadUrl);

export default router;
