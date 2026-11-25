import { Readable } from 'node:stream';
import { parseCsvBuffer, safeCsvFilename } from '../validators/csvValidators.js';

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_CSV_BYTES + 64 * 1024;

function formError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function parseCsvUpload(request, _response, next) {
  const contentType = request.get('content-type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return next(formError(400, 'Upload the CSV as multipart form data'));
  const declaredLength = Number(request.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    request.resume();
    return next(formError(413, 'CSV files must be 1 MB or smaller'));
  }
  let received = 0;
  const stream = Readable.toWeb(request).pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_MULTIPART_BYTES) return controller.error(formError(413, 'CSV files must be 1 MB or smaller'));
      controller.enqueue(chunk);
    },
  }));
  try {
    const form = await new Request('http://csv-upload.local', {
      method: 'POST', headers: { 'content-type': contentType }, body: stream, duplex: 'half',
    }).formData();
    if ([...form.keys()].some((key) => !['file', 'designId', 'mapping'].includes(key))) throw formError(400, 'The CSV request contains unsupported fields');
    if (form.getAll('designId').length > 1 || form.getAll('mapping').length > 1) throw formError(400, 'The CSV request contains duplicate fields');
    const files = form.getAll('file');
    if (files.length !== 1 || typeof files[0]?.arrayBuffer !== 'function' || typeof files[0]?.name !== 'string') {
      throw formError(400, 'Choose exactly one CSV file');
    }
    const file = files[0];
    const filename = safeCsvFilename(file.name);
    if (file.size > MAX_CSV_BYTES) throw formError(413, 'CSV files must be 1 MB or smaller');
    const csv = parseCsvBuffer(Buffer.from(await file.arrayBuffer()));
    request.csvUpload = {
      filename,
      csv,
      designId: form.get('designId'),
      mapping: form.get('mapping'),
    };
    next();
  } catch (error) {
    next(error.statusCode ? error : formError(400, 'The CSV upload could not be read'));
  }
}
