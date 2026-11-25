import { Router } from 'express';
import {
  getVariableDataBatches,
  getVariableDataOutputDownload,
  postCsvPreview,
  postVariableDataBatch,
} from '../controllers/variableDataController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { parseCsvUpload } from '../middleware/parseCsvUpload.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateOutputIds(request, response, next) {
  if (![request.params.batchId, request.params.outputId].every((value) => UUID.test(value))) {
    return response.status(400).json({ success: false, message: 'A valid batch and output ID are required' });
  }
  next();
}
function validateBatchInput(request, response, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.csvUpload?.designId || '')) {
    return response.status(400).json({ success: false, message: 'Choose a valid saved design' });
  }
  next();
}

const router = Router();
router.use(requireAuth);
router.post('/preview', parseCsvUpload, postCsvPreview);
router.post('/batches', parseCsvUpload, validateBatchInput, postVariableDataBatch);
router.get('/batches', getVariableDataBatches);
router.get('/batches/:batchId/outputs/:outputId/download', validateOutputIds, getVariableDataOutputDownload);

export default router;
