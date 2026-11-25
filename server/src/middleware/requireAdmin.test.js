import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from './requireAdmin.js';

function responseStub() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function userWithRole(role, error = null) {
  const query = {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: role ? { role } : null, error }),
  };
  return { user: { id: 'auth-verified-user' }, userSupabase: { from: () => query } };
}

test('allows an admin based on the database role', async () => {
  const request = userWithRole('admin');
  const response = responseStub();
  let continued = false;
  await requireAdmin(request, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(request.user.role, 'admin');
});

test('rejects a customer even if request data claims an admin role', async () => {
  const request = userWithRole('customer');
  request.user.role = 'admin';
  const response = responseStub();
  let continued = false;
  await requireAdmin(request, response, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(response.statusCode, 403);
});

test('fails closed when role lookup errors or auth context is missing', async () => {
  const response = responseStub();
  let failure;
  await requireAdmin(userWithRole(null, new Error('database unavailable')), response, (error) => { failure = error; });
  assert.equal(failure.statusCode, 503);

  const unauthenticated = responseStub();
  await requireAdmin({}, unauthenticated, () => assert.fail('must not continue'));
  assert.equal(unauthenticated.statusCode, 401);
});
