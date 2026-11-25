import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateOrder } from './orderValidators.js';

const productId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const groupId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';
const valueId = 'b47ac10b-58cc-4372-a567-0e02b2c3d479';
const validOrder = {
  idempotencyKey: 'c47ac10b-58cc-4372-a567-0e02b2c3d479',
  items: [{ productId, quantity: 2, selectedOptions: [{ optionGroupId: groupId, optionValueIds: [valueId] }], customInputs: [] }],
  deliveryAddress: { addressLine1: '  12 Print Lane ', city: ' Pune ', state: ' Maharashtra ', postalCode: '411001', country: ' India ' },
  contact: { fullName: ' Ada Customer ', phone: ' ' },
};

function run(body) {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  const request = { body };
  let continued = false;
  validateCreateOrder(request, response, () => { continued = true; });
  return { request, response, continued };
}

test('order validator normalizes the delivery and contact snapshots', () => {
  const result = run(validOrder);
  assert.equal(result.continued, true);
  assert.deepEqual(result.request.orderInput.deliveryAddress, {
    address_line_1: '12 Print Lane', address_line_2: null, city: 'Pune', state: 'Maharashtra',
    postal_code: '411001', country: 'India',
  });
  assert.deepEqual(result.request.orderInput.contact, { full_name: 'Ada Customer', phone: null });
});

test('order validator accepts an optional saved design ID and rejects invalid IDs', () => {
  const designId = 'd47ac10b-58cc-4372-a567-0e02b2c3d479';
  const valid = run({ ...validOrder, items: [{ ...validOrder.items[0], designId }] });
  assert.equal(valid.continued, true);
  assert.equal(valid.request.orderInput.items[0].designId, designId);
  assert.equal(run(validOrder).request.orderInput.items[0].designId, null);
  const invalid = run({ ...validOrder, items: [{ ...validOrder.items[0], designId: 'not-a-uuid' }] });
  assert.equal(invalid.continued, false);
  assert.equal(invalid.response.statusCode, 400);
});

test('order validator rejects frontend prices and totals', () => {
  for (const body of [{ ...validOrder, total: 1 }, { ...validOrder, subtotal: 1 }, { ...validOrder, items: [{ ...validOrder.items[0], unitPrice: 1 }] }]) {
    const result = run(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});

test('order validator rejects invalid cart items and address fields', () => {
  const invalidOrders = [
    { ...validOrder, items: [] },
    { ...validOrder, items: [{ ...validOrder.items[0], quantity: 0 }] },
    { ...validOrder, items: [{ ...validOrder.items[0], productId: 'bad-id' }] },
    { ...validOrder, deliveryAddress: { ...validOrder.deliveryAddress, addressLine1: '' } },
    { ...validOrder, deliveryAddress: { ...validOrder.deliveryAddress, customerId: productId } },
  ];
  for (const body of invalidOrders) {
    const result = run(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});
