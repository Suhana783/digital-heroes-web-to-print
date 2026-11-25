import path from 'node:path';

export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

const allowedTypes = new Map([
  ['.pdf', { mimeType: 'application/pdf', signature: (data) => data.subarray(0, 5).toString('ascii') === '%PDF-' }],
  ['.png', { mimeType: 'image/png', signature: (data) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['.jpg', { mimeType: 'image/jpeg', signature: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff }],
  ['.jpeg', { mimeType: 'image/jpeg', signature: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff }],
  ['.svg', { mimeType: 'image/svg+xml', signature: isSvgDocument }],
]);

function isSvgDocument(data) {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(data);
    return /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(source);
  } catch {
    return false;
  }
}

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function validateArtworkFile({ filename, mimeType, size, buffer }) {
  if (!filename || typeof filename !== 'string' || !Buffer.isBuffer(buffer)) {
    throw invalid('Choose one artwork file to upload');
  }
  if (size < 1 || size > MAX_ARTWORK_BYTES || size !== buffer.length) {
    const error = new Error('Artwork files must be between 1 byte and 10 MB');
    error.statusCode = size > MAX_ARTWORK_BYTES ? 413 : 400;
    throw error;
  }

  const originalFilename = path.basename(filename.replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!originalFilename || Buffer.byteLength(originalFilename, 'utf8') > 255) {
    throw invalid('The filename must be 255 bytes or fewer');
  }

  const extension = path.extname(originalFilename).toLowerCase();
  const format = allowedTypes.get(extension);
  if (!format || mimeType !== format.mimeType || !format.signature(buffer)) {
    throw invalid('Unsupported artwork file. Upload a valid PDF, PNG, JPG, JPEG, or SVG file.');
  }

  return { originalFilename, mimeType: format.mimeType, size, buffer, extension };
}

export function validateArtworkId(request, response, next) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(request.params.artworkId || '')) {
    return response.status(400).json({ success: false, message: 'A valid artwork ID is required' });
  }
  next();
}
