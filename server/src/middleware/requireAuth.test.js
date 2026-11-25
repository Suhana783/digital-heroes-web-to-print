import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from './requireAuth.js';

test('protected order APIs reject requests without a bearer token', async () => {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  let continued = false;
  await requireAuth({ get: () => undefined }, response, () => { continued = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.success, false);
  assert.equal(continued, false);
});
