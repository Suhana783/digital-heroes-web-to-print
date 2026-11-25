import { Router } from 'express';
import {
  getAdminArtworkDownload,
  getAdminPrintDownload,
  getAdminProofDownload,
  getAdminProofItemDetails,
  getAdminProofQueue,
  postAdminProof,
  postGeneratedPrintFile,
  postValidatePrintFile,
} from '../controllers/proofController.js';
import { parseProofForm } from '../middleware/parseProofForm.js';
import { validateArtworkId } from '../validators/artworkValidators.js';
import { validateOrderItemId, validatePrintFileId, validateProofId } from '../validators/proofValidators.js';

const router = Router();
router.get('/queue', getAdminProofQueue);
router.get('/items/:orderItemId', validateOrderItemId, getAdminProofItemDetails);
router.post('/items/:orderItemId', validateOrderItemId, parseProofForm, postAdminProof);
router.post('/items/:orderItemId/print-files', validateOrderItemId, postGeneratedPrintFile);
router.get('/proofs/:proofId/download', validateProofId, getAdminProofDownload);
router.get('/artwork/:artworkId/download', validateArtworkId, getAdminArtworkDownload);
router.get('/print-files/:printFileId/download', validatePrintFileId, getAdminPrintDownload);
router.post('/print-files/:printFileId/validate', validatePrintFileId, postValidatePrintFile);

export default router;
