import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseArtworkForm } from './parseArtworkForm.js';

test('parses one artwork file and optional order item ID from multipart form data', async () => {
  const boundary = 'dh-test-boundary';
  const orderItemId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="orderItemId"\r\n\r\n${orderItemId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="artwork.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from('%PDF-1.7\n'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const request = Readable.from([body]);
  request.get = (name) => ({
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
  }[name.toLowerCase()]);

  const error = await new Promise((resolve) => parseArtworkForm(request, {}, resolve));
  assert.equal(error, undefined);
  assert.equal(request.artworkInput.originalFilename, 'artwork.pdf');
  assert.equal(request.artworkInput.orderItemId, orderItemId);
  assert.equal(request.artworkInput.buffer.toString('ascii'), '%PDF-1.7\n');
});
