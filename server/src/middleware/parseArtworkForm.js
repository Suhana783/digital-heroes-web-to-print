import { Readable } from 'node:stream';
import { MAX_ARTWORK_BYTES, validateArtworkFile } from '../validators/artworkValidators.js';

const MAX_MULTIPART_BYTES = MAX_ARTWORK_BYTES + 64 * 1024;

function formError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function parseArtworkForm(request, _response, next) {
  const contentType = request.get('content-type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    return next(formError(400, 'Upload the artwork as multipart form data'));
  }

  const declaredLength = Number(request.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    request.resume();
    return next(formError(413, 'Artwork files must be 10 MB or smaller'));
  }

  let received = 0;
  const bodyStream = Readable.toWeb(request).pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_MULTIPART_BYTES) {
        const error = formError(413, 'Artwork files must be 10 MB or smaller');
        controller.error(error);
        return;
      }
      controller.enqueue(chunk);
    },
  }));

  try {
    const multipartRequest = new Request('http://artwork-upload.local', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bodyStream,
      duplex: 'half',
    });
    const form = await multipartRequest.formData();
    const entries = [...form.entries()];
    if (entries.some(([name]) => !['file', 'orderItemId'].includes(name))) {
      throw formError(400, 'Only a file and an optional order item ID can be uploaded');
    }

    const files = form.getAll('file');
    const orderItemIds = form.getAll('orderItemId');
    if (files.length !== 1 || orderItemIds.length > 1 || !(files[0] instanceof File)) {
      throw formError(400, 'Choose exactly one artwork file');
    }
    if (orderItemIds.some((value) => typeof value !== 'string')) {
      throw formError(400, 'The order item ID must be text');
    }
    const orderItemId = orderItemIds[0]?.trim() || null;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (orderItemId && !uuidPattern.test(orderItemId)) {
      throw formError(400, 'A valid order item ID is required');
    }

    const file = files[0];
    const buffer = Buffer.from(await file.arrayBuffer());
    request.artworkInput = {
      ...validateArtworkFile({ filename: file.name, mimeType: file.type, size: file.size, buffer }),
      orderItemId,
    };
    next();
  } catch (error) {
    next(error.statusCode ? error : formError(400, 'The multipart upload could not be read'));
  }
}
