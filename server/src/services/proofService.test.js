import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createDraftPdf } from './proofService.js';

test('copies existing PDF pages without changing page size', async () => {
  const sourceDocument = await PDFDocument.create();
  sourceDocument.addPage([360, 540]);
  sourceDocument.addPage([400, 600]);
  const source = Buffer.from(await sourceDocument.save());
  const result = await createDraftPdf(source, { mime_type: 'application/pdf' }, {
    product_name: 'Poster', quantity: 2, selected_options: [{ label: 'Matte' }],
  });
  const output = await PDFDocument.load(result.bytes);
  assert.equal(output.getPageCount(), 2);
  assert.deepEqual(result.pageSize, { width: 360, height: 540 });
  assert.match(output.getSubject(), /Poster/);
});

test('fits PNG artwork to the default A4 page', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  const result = await createDraftPdf(png, { mime_type: 'image/png' }, {
    product_name: 'Flyer', quantity: 5, selected_options: [],
  });
  const output = await PDFDocument.load(result.bytes);
  assert.equal(output.getPageCount(), 1);
  assert.deepEqual(result.pageSize, { width: 595.28, height: 841.89 });
});

test('returns a clear error for SVG artwork', async () => {
  await assert.rejects(
    createDraftPdf(Buffer.from('<svg/>'), { mime_type: 'image/svg+xml' }, { product_name: 'Label' }),
    { statusCode: 400, message: /SVG artwork cannot be generated/ },
  );
});
