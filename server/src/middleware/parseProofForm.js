import { Readable } from 'node:stream';
import path from 'node:path';

const MAX_PROOF_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_PROOF_BYTES + 64 * 1024;

function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function parseProofForm(request, _response, next) {
  const contentType = request.get('content-type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return next(fail(400, 'Upload the proof as multipart form data'));
  const declaredLength = Number(request.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    request.resume();
    return next(fail(413, 'Proof PDFs must be 20 MB or smaller'));
  }

  let received = 0;
  const stream = Readable.toWeb(request).pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_MULTIPART_BYTES) return controller.error(fail(413, 'Proof PDFs must be 20 MB or smaller'));
      controller.enqueue(chunk);
    },
  }));

  try {
    const form = await new Request('http://proof-upload.local', {
      method: 'POST', headers: { 'content-type': contentType }, body: stream, duplex: 'half',
    }).formData();
    if ([...form.keys()].some((key) => !['file', 'adminNotes'].includes(key))) throw fail(400, 'Only a PDF and optional customer notes can be uploaded');
    const files = form.getAll('file');
    const notes = form.getAll('adminNotes');
    if (files.length !== 1 || notes.length > 1 || !(files[0] instanceof File)) throw fail(400, 'Choose exactly one proof PDF');
    if (notes.some((note) => typeof note !== 'string') || (notes[0]?.length || 0) > 4000) throw fail(400, 'Customer notes must be 4,000 characters or fewer');

    const file = files[0];
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 6 || buffer.length > MAX_PROOF_BYTES) throw fail(buffer.length > MAX_PROOF_BYTES ? 413 : 400, 'Proof PDFs must be between 1 byte and 20 MB');
    if (file.type !== 'application/pdf' || path.extname(file.name).toLowerCase() !== '.pdf' || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw fail(400, 'Only a valid PDF proof is supported');
    }
    request.proofInput = {
      buffer,
      filename: path.basename(file.name.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'proof.pdf',
      adminNotes: notes[0]?.trim() || null,
    };
    next();
  } catch (error) {
    next(error.statusCode ? error : fail(400, 'The proof upload could not be read'));
  }
}
