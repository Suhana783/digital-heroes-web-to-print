import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCreatePaymentOrder,
  validateMockSimulation,
  validateRazorpayPaymentVerification,
} from './paymentValidators.js';

const orderId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const paymentOrderId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';

function run(validator, request) {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  let continued = false;
  validator(request, response, () => { continued = true; });
  return { response, continued };
}

test('payment order creation accepts only an order UUID', () => {
  assert.equal(run(validateCreatePaymentOrder, { body: { orderId } }).continued, true);
  for (const body of [{}, { orderId: 'bad-id' }, { orderId, amount: 1 }]) {
    const result = run(validateCreatePaymentOrder, { body });
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});

test('mock payment simulation accepts only an owned-attempt identifier shape and outcome', () => {
  assert.equal(run(validateMockSimulation, { body: { orderId, paymentOrderId, outcome: 'success' } }).continued, true);
  for (const body of [
    { orderId, paymentOrderId, outcome: 'paid' },
    { orderId, paymentOrderId, outcome: 'success', amount: 1 },
    { orderId, paymentOrderId: 'bad-id', outcome: 'failure' },
  ]) {
    const result = run(validateMockSimulation, { body });
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});

test('Razorpay verification requires a complete provider response and rejects extra fields', () => {
  const valid = {
    orderId, paymentOrderId, razorpay_order_id: 'order_123abc',
    razorpay_payment_id: 'pay_456def', razorpay_signature: 'a'.repeat(64),
  };
  assert.equal(run(validateRazorpayPaymentVerification, { body: valid }).continued, true);
  for (const body of [
    { ...valid, razorpay_signature: 'short' },
    { ...valid, amount: 100 },
    { ...valid, razorpay_payment_id: 'invalid' },
  ]) {
    const result = run(validateRazorpayPaymentVerification, { body });
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});
