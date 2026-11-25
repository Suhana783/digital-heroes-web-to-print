import { Readable } from 'node:stream';
import { validateDesignAsset } from '../validators/designerValidators.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_BYTES + 64 * 1024;

function formError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function parseDesignAssetForm(request, _response, next) {
  const contentType = request.get('content-type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return next(formError(400, 'Upload the file as multipart form data'));
  const declaredLength = Number(request.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    request.resume();
    return next(formError(413, 'Design files must be 10 MB or smaller'));
  }
  let received = 0;
  const stream = Readable.toWeb(request).pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_MULTIPART_BYTES) return controller.error(formError(413, 'Design files must be 10 MB or smaller'));
      controller.enqueue(chunk);
    },
  }));
  try {
    const form = await new Request('http://design-upload.local', {
      method: 'POST', headers: { 'content-type': contentType }, body: stream, duplex: 'half',
    }).formData();
    if ([...form.keys()].some((key) => key !== 'file')) throw formError(400, 'Only one design file can be uploaded');
    const files = form.getAll('file');
    if (files.length !== 1 || typeof files[0]?.arrayBuffer !== 'function' || typeof files[0]?.name !== 'string') {
      throw formError(400, 'Choose exactly one design file');
    }
    const file = files[0];
    const buffer = Buffer.from(await file.arrayBuffer());
    request.designAssetInput = validateDesignAsset({ filename: file.name, mimeType: file.type, size: file.size, buffer });
    next();
  } catch (error) {
    next(error.statusCode ? error : formError(400, 'The design upload could not be read'));
  }
}
