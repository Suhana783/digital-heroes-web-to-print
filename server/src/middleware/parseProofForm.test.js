import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { parseProofForm } from './parseProofForm.js';

function runParser(body, contentType) {
  return new Promise((resolve) => {
    const request = Readable.from(body);
    request.get = (name) => name.toLowerCase() === 'content-type' ? contentType : undefined;
    parseProofForm(request, {}, (error) => resolve({ error, request }));
  });
}

test('parses a PDF proof and admin notes from multipart form data', async () => {
  const boundary = 'proof-upload-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from('%PDF-1.7\nproof'),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="adminNotes"\r\n\r\nPlease review\r\n--${boundary}--\r\n`),
  ]);
  const { error, request } = await runParser(body, `multipart/form-data; boundary=${boundary}`);
  assert.equal(error, undefined);
  assert.equal(request.proofInput.filename, 'proof.pdf');
  assert.equal(request.proofInput.adminNotes, 'Please review');
  assert.equal(request.proofInput.buffer.subarray(0, 5).toString(), '%PDF-');
});

test('rejects a non-PDF upload', async () => {
  const boundary = 'not-pdf-boundary';
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.png"\r\nContent-Type: image/png\r\n\r\nnot a pdf\r\n--${boundary}--\r\n`);
  const { error } = await runParser(body, `multipart/form-data; boundary=${boundary}`);
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /valid PDF/);
});
