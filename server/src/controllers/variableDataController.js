import {
  downloadVariableDataOutput,
  generateVariableDataBatch,
  listVariableDataBatches,
  previewVariableDataCsv,
} from '../services/variableDataService.js';

export async function postCsvPreview(request, response, next) {
  try {
    const data = await previewVariableDataCsv(request.csvUpload);
    response.status(200).json({ success: true, message: 'CSV preview ready', data });
  } catch (error) { next(error); }
}

export async function postVariableDataBatch(request, response, next) {
  try {
    const { designId, mapping, ...upload } = request.csvUpload;
    const data = await generateVariableDataBatch({ customerId: request.user.id, designId, mapping, ...upload });
    response.status(201).json({ success: true, message: 'Variable-data batch processed', data });
  } catch (error) { next(error); }
}

export async function getVariableDataBatches(request, response, next) {
  try {
    const data = await listVariableDataBatches(request.user.id);
    response.status(200).json({ success: true, message: 'Variable-data batches retrieved', data });
  } catch (error) { next(error); }
}

export async function getVariableDataOutputDownload(request, response, next) {
  try {
    const data = await downloadVariableDataOutput(request.user.id, request.params.batchId, request.params.outputId);
    response.status(200).json({ success: true, message: 'Secure output link created', data });
  } catch (error) { next(error); }
}
