import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ARTWORK_BYTES, validateArtworkFile } from './artworkValidators.js';

test('accepts matching PDF, PNG, JPEG and SVG file signatures', () => {
  const valid = [
    { filename: 'job.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') },
    { filename: 'job.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
    { filename: 'job.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) },
    { filename: 'job.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
  ];
  for (const file of valid) {
    const result = validateArtworkFile({ ...file, size: file.buffer.length });
    assert.equal(result.originalFilename, file.filename);
    assert.equal(result.mimeType, file.mimeType);
  }
});

test('rejects mismatched extensions, MIME types, and file signatures', () => {
  const invalid = [
    { filename: 'payload.exe', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') },
    { filename: 'payload.pdf', mimeType: 'image/png', buffer: Buffer.from('%PDF-1.7') },
    { filename: 'payload.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
    { filename: 'payload.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<html></html>') },
  ];
  for (const file of invalid) {
    assert.throws(() => validateArtworkFile({ ...file, size: file.buffer.length }), /Unsupported artwork file/);
  }
});

test('rejects empty, oversized, and unsafe filenames', () => {
  assert.throws(() => validateArtworkFile({ filename: '', mimeType: 'application/pdf', size: 1, buffer: Buffer.from('%') }), /Choose one/);
  assert.throws(() => validateArtworkFile({ filename: 'too-big.pdf', mimeType: 'application/pdf', size: MAX_ARTWORK_BYTES + 1, buffer: Buffer.alloc(MAX_ARTWORK_BYTES + 1) }), { statusCode: 413 });
  assert.throws(() => validateArtworkFile({ filename: `${'a'.repeat(252)}.pdf`, mimeType: 'application/pdf', size: 8, buffer: Buffer.from('%PDF-1.7') }), /255 bytes/);
});
