import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProofResponse } from './proofValidators.js';

function validate(body) {
  let status;
  let payload;
  let continued = false;
  validateProofResponse({ body }, { status(code) { status = code; return this; }, json(value) { payload = value; return this; } }, () => { continued = true; });
  return { status, payload, continued };
}

test('requires feedback for a change request', () => {
  const result = validate({ decision: 'changes_requested', feedback: '  ' });
  assert.equal(result.status, 400);
  assert.equal(result.continued, false);
});

test('accepts approval and rejects invalid decisions or oversized feedback', () => {
  assert.equal(validate({ decision: 'approved' }).continued, true);
  assert.equal(validate({ decision: 'delete' }).status, 400);
  assert.equal(validate({ decision: 'approved', feedback: 'x'.repeat(4001) }).status, 400);
});
