import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileUpdate } from './accountValidators.js';

function run(body) {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  const request = { body };
  let continued = false;
  validateProfileUpdate(request, response, () => { continued = true; });
  return { request, response, continued };
}

test('profile updates trim full name and normalize blank phone to null', () => {
  const result = run({ full_name: '  Ada Customer  ', phone: '   ' });
  assert.equal(result.continued, true);
  assert.deepEqual(result.request.profileUpdates, { full_name: 'Ada Customer', phone: null });
});

test('phone can be updated independently', () => {
  const result = run({ phone: '+91 12345 67890' });
  assert.equal(result.continued, true);
  assert.deepEqual(result.request.profileUpdates, { phone: '+91 12345 67890' });
});

test('email, customer id, role changes, empty bodies, and invalid values are rejected', () => {
  for (const body of [{ email: 'new@example.com' }, { id: 'other-user' }, { role: 'admin' }, {}, { full_name: '  ' }, { phone: 123 }, { phone: 'x'.repeat(31) }]) {
    const result = run(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});
