import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { amountToPaise, getPaymentMode, signatureMatches } from './paymentService.js';

test('payment amount conversion uses exact paise and rejects malformed or out-of-range values', () => {
  assert.equal(amountToPaise('1'), 100);
  assert.equal(amountToPaise('12.3'), 1230);
  assert.equal(amountToPaise('12.34'), 1234);
  for (const value of ['0.99', '-1.00', '1.001', '1e3', 'abc', '90071992547409.92']) {
    assert.throws(() => amountToPaise(value));
  }
});

test('payment mode defaults to local mock, rejects mock in production, and allows Razorpay mode', () => {
  const previousMode = process.env.PAYMENT_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.PAYMENT_MODE;
    process.env.NODE_ENV = 'development';
    assert.equal(getPaymentMode(), 'mock');
    process.env.NODE_ENV = 'production';
    assert.throws(() => getPaymentMode(), /disabled in production/);
    process.env.PAYMENT_MODE = 'razorpay';
    assert.equal(getPaymentMode(), 'razorpay');
    process.env.PAYMENT_MODE = 'live';
    assert.throws(() => getPaymentMode(), /must be either mock or razorpay/);
  } finally {
    if (previousMode === undefined) delete process.env.PAYMENT_MODE;
    else process.env.PAYMENT_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('Razorpay HMAC comparison accepts the matching SHA-256 signature and rejects mismatches', () => {
  const orderId = 'order_test123';
  const paymentId = 'pay_test456';
  const secret = 'server-only-test-secret';
  const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(signatureMatches(orderId, paymentId, signature, secret), true);
  assert.equal(signatureMatches(orderId, paymentId, '0'.repeat(64), secret), false);
  assert.equal(signatureMatches(orderId, paymentId, 'not-a-signature', secret), false);
});
