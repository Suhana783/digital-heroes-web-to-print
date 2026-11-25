import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { getServiceRoleSupabaseClient } from '../config/supabase.js';

let razorpayClient;
let generatedMockSecret;

function paymentError(statusCode, message, cause, publicMessage = false) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage ? message : undefined;
  if (cause) error.cause = cause;
  return error;
}

export function getPaymentMode() {
  const mode = process.env.PAYMENT_MODE || 'mock';
  if (!['mock', 'razorpay'].includes(mode)) {
    throw paymentError(503, 'PAYMENT_MODE must be either mock or razorpay', undefined, true);
  }
  if (mode === 'mock' && process.env.NODE_ENV === 'production') {
    throw paymentError(503, 'Local mock payments are disabled in production', undefined, true);
  }
  return mode;
}

function getRazorpay() {
  if (razorpayClient) return razorpayClient;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || !keyId.startsWith('rzp_test_')) {
    throw paymentError(503, 'Razorpay mode is selected but valid test credentials are not configured', undefined, true);
  }
  razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayClient;
}

function mockSecret() {
  const configured = process.env.MOCK_PAYMENT_SECRET;
  if (configured) {
    if (configured.length < 32) {
      throw paymentError(503, 'MOCK_PAYMENT_SECRET must contain at least 32 characters', undefined, true);
    }
    return configured;
  }
  generatedMockSecret ||= randomBytes(32).toString('hex');
  return generatedMockSecret;
}

export function amountToPaise(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw paymentError(409, 'The stored order total cannot be used for payment');
  const amount = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  if (amount < 100n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw paymentError(400, 'The order amount is outside the supported payment range');
  }
  return Number(amount);
}

function mapDatabaseError(error, message) {
  if (error?.code === 'P0002') return paymentError(404, error.message || message, error);
  if (error?.code === '55000') return paymentError(409, error.message || message, error);
  if (error?.code === '22023') return paymentError(400, error.message || message, error);
  return paymentError(503, message, error);
}

async function ownedOrder(customerId, orderId) {
  const { data, error } = await getServiceRoleSupabaseClient().from('orders')
    .select('id, order_number, customer_id, status, production_stage, payment_status, total_amount, currency')
    .eq('id', orderId).eq('customer_id', customerId).maybeSingle();
  if (error) throw paymentError(503, 'Order payment details are temporarily unavailable', error);
  if (!data) throw paymentError(404, 'Order not found');
  return data;
}

function ensureEligible(order) {
  if (['cancelled', 'completed'].includes(order.status) || ['production', 'completed'].includes(order.production_stage)) {
    throw paymentError(409, 'This order is no longer eligible for payment');
  }
  if (order.payment_status === 'paid' || order.payment_status === 'refunded') {
    throw paymentError(409, 'This order cannot accept another payment');
  }
  if (order.currency !== 'INR') throw paymentError(409, 'Payments are currently available for INR orders only');
}

function createResponse(attempt, mode) {
  return {
    mode,
    paymentOrderId: attempt.id,
    gatewayOrderId: attempt.gateway_order_id,
    orderId: attempt.order_id,
    amount: attempt.amount_paise,
    currency: attempt.currency,
    orderReference: attempt.orders?.order_number || undefined,
    keyId: mode === 'razorpay' ? process.env.RAZORPAY_KEY_ID : undefined,
    status: attempt.status,
  };
}

async function findPendingAttempt(customerId, orderId, mode) {
  const { data, error } = await getServiceRoleSupabaseClient().from('payment_attempts')
    .select('id, order_id, provider, amount_paise, currency, status, gateway_order_id, orders(order_number)')
    .eq('customer_id', customerId).eq('order_id', orderId).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw paymentError(503, 'Payment attempts are temporarily unavailable', error);
  return data;
}

export async function createPaymentOrder(customerId, orderId) {
  const mode = getPaymentMode();
  const order = await ownedOrder(customerId, orderId);
  ensureEligible(order);
  const amount = amountToPaise(order.total_amount);
  if (mode === 'razorpay') getRazorpay();

  const existing = await findPendingAttempt(customerId, orderId, mode);
  if (existing) {
    if (existing.provider !== mode) {
      throw paymentError(409, 'A payment attempt is already open in another payment mode');
    }
    if (existing.amount_paise !== amount || existing.currency !== order.currency) {
      throw paymentError(409, 'The pending payment attempt no longer matches this order total');
    }
    return createResponse(existing, mode);
  }

  let gatewayOrderId;
  if (mode === 'mock') {
    gatewayOrderId = `mock_order_${randomUUID()}`;
  } else {
    let gatewayOrder;
    try {
      gatewayOrder = await getRazorpay().orders.create({
        amount, currency: order.currency, receipt: order.order_number,
        notes: { application_order_id: order.id, customer_id: customerId },
      });
    } catch (error) {
      if (error.statusCode) throw error;
      throw paymentError(503, 'Razorpay could not start a payment for this order', error);
    }
    if (gatewayOrder.amount !== amount || gatewayOrder.currency !== order.currency || !gatewayOrder.id) {
      throw paymentError(503, 'Razorpay returned an invalid payment order');
    }
    gatewayOrderId = gatewayOrder.id;
  }

  const { data, error } = await getServiceRoleSupabaseClient().rpc('create_payment_attempt', {
    p_order_id: order.id,
    p_customer_id: customerId,
    p_provider: mode,
    p_amount_paise: amount,
    p_currency: order.currency,
    p_gateway_order_id: gatewayOrderId,
  });
  if (error) throw mapDatabaseError(error, 'The payment attempt could not be saved');
  const attempt = Array.isArray(data) ? data[0] : data;
  if (!attempt) throw paymentError(503, 'The payment attempt could not be saved');
  const withOrder = { ...attempt, orders: { order_number: order.order_number } };
  return createResponse(withOrder, mode);
}

async function ownedAttempt(customerId, orderId, paymentOrderId) {
  const { data, error } = await getServiceRoleSupabaseClient().from('payment_attempts')
    .select('id, order_id, customer_id, provider, amount_paise, currency, status, gateway_order_id, gateway_payment_id, verified_at, orders(order_number)')
    .eq('id', paymentOrderId).eq('order_id', orderId).eq('customer_id', customerId).maybeSingle();
  if (error) throw paymentError(503, 'Payment attempt is temporarily unavailable', error);
  if (!data) throw paymentError(404, 'Payment attempt not found');
  return data;
}

async function finishAttempt(attempt, succeeded, paymentReference = null) {
  const { data, error } = await getServiceRoleSupabaseClient().rpc('complete_payment_attempt', {
    p_payment_attempt_id: attempt.id,
    p_customer_id: attempt.customer_id,
    p_succeeded: succeeded,
    p_gateway_payment_id: paymentReference,
    p_verified_at: succeeded ? new Date().toISOString() : null,
  });
  if (error) throw mapDatabaseError(error, 'Payment status could not be saved');
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw paymentError(503, 'Payment status could not be saved');
  return {
    orderId: result.order_id,
    paymentOrderId: result.id,
    paymentStatus: result.status,
    mode: result.provider,
    amount: result.amount_paise,
    currency: result.currency,
    paymentReference: result.status === 'paid' ? result.gateway_payment_id : null,
    verifiedAt: result.verified_at,
  };
}

export function signatureMatches(orderId, paymentId, signature, secret) {
  if (!/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export async function verifyRazorpayPayment(customerId, input) {
  if (getPaymentMode() !== 'razorpay') throw paymentError(409, 'Razorpay verification is unavailable in mock mode');
  const order = await ownedOrder(customerId, input.orderId);
  const attempt = await ownedAttempt(customerId, order.id, input.paymentOrderId);
  const razorpay = getRazorpay();
  if (attempt.provider !== 'razorpay' || attempt.gateway_order_id !== input.razorpay_order_id) {
    throw paymentError(400, 'The Razorpay order does not match this payment attempt');
  }
  if (attempt.status === 'paid') {
    if (attempt.gateway_payment_id === input.razorpay_payment_id) {
      return finishAttempt(attempt, true, input.razorpay_payment_id);
    }
    throw paymentError(409, 'This payment attempt was already completed');
  }
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!signatureMatches(attempt.gateway_order_id, input.razorpay_payment_id, input.razorpay_signature, keySecret)) {
    throw paymentError(400, 'Razorpay payment signature verification failed');
  }
  let payment;
  try { payment = await razorpay.payments.fetch(input.razorpay_payment_id); }
  catch (error) { throw paymentError(503, 'Razorpay payment status could not be verified', error); }
  if (payment.order_id !== attempt.gateway_order_id || payment.amount !== attempt.amount_paise || payment.currency !== attempt.currency) {
    throw paymentError(400, 'The verified payment does not match the order amount and currency');
  }
  if (payment.status !== 'captured') throw paymentError(409, 'Razorpay has not confirmed a captured payment');
  return finishAttempt(attempt, true, input.razorpay_payment_id);
}

function createMockGatewayResponse(attempt, outcome, secret) {
  const response = {
    attemptId: attempt.id,
    orderId: attempt.order_id,
    amount: attempt.amount_paise,
    currency: attempt.currency,
    outcome,
    nonce: randomUUID(),
    paymentReference: outcome === 'success' ? `mock_pay_${randomUUID()}` : null,
  };
  const signedData = [response.attemptId, response.orderId, response.amount, response.currency,
    response.outcome, response.nonce, response.paymentReference || ''].join('|');
  return { ...response, signature: createHmac('sha256', secret).update(signedData).digest() };
}

function verifyMockGatewayResponse(response, secret) {
  const signedData = [response.attemptId, response.orderId, response.amount, response.currency,
    response.outcome, response.nonce, response.paymentReference || ''].join('|');
  const expected = createHmac('sha256', secret).update(signedData).digest();
  return response.signature.length === expected.length && timingSafeEqual(response.signature, expected);
}

export async function simulateMockPayment(customerId, input) {
  if (getPaymentMode() !== 'mock') throw paymentError(409, 'Mock payment simulation is only available in mock mode');
  const attempt = await ownedAttempt(customerId, input.orderId, input.paymentOrderId);
  if (attempt.provider !== 'mock') throw paymentError(409, 'This is not a mock payment attempt');
  if (!['success', 'failure'].includes(input.outcome)) throw paymentError(400, 'Choose a valid mock payment result');
  if (attempt.status === 'paid') {
    if (input.outcome === 'success') return finishAttempt(attempt, true, attempt.gateway_payment_id);
    throw paymentError(409, 'This payment attempt has already succeeded');
  }
  if (attempt.status !== 'pending') throw paymentError(409, 'Create a new payment attempt before retrying');

  // The simulated result and its HMAC are both created and checked on the server.
  const secret = mockSecret();
  const mockResponse = createMockGatewayResponse(attempt, input.outcome, secret);
  if (!verifyMockGatewayResponse(mockResponse, secret)) {
    throw paymentError(400, 'Mock payment simulation could not be verified');
  }
  return finishAttempt(attempt, mockResponse.outcome === 'success', mockResponse.paymentReference);
}

export async function failRazorpayPayment(customerId, input) {
  if (getPaymentMode() !== 'razorpay') throw paymentError(409, 'Razorpay failure handling is unavailable in mock mode');
  const attempt = await ownedAttempt(customerId, input.orderId, input.paymentOrderId);
  getRazorpay();
  if (attempt.provider !== 'razorpay') throw paymentError(409, 'This is not a Razorpay payment attempt');
  if (attempt.status === 'paid') return finishAttempt(attempt, true, attempt.gateway_payment_id);
  return finishAttempt(attempt, false);
}

export async function getCustomerPaymentStatus(customerId, orderId) {
  const order = await ownedOrder(customerId, orderId);
  const { data, error } = await getServiceRoleSupabaseClient().from('payment_attempts')
    .select('id, provider, amount_paise, currency, status, verified_at, created_at')
    .eq('order_id', orderId).eq('customer_id', customerId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw paymentError(503, 'Payment status is temporarily unavailable', error);
  return {
    orderId: order.id,
    orderReference: order.order_number,
    paymentStatus: order.payment_status,
    amount: order.total_amount,
    currency: order.currency,
    latestAttempt: data ? {
      paymentOrderId: data.id, mode: data.provider, amount: data.amount_paise,
      currency: data.currency, status: data.status, verifiedAt: data.verified_at, createdAt: data.created_at,
    } : null,
  };
}

export async function listAdminPaymentAttempts() {
  const { data, error } = await getServiceRoleSupabaseClient().from('payment_attempts')
    .select('id, order_id, customer_id, provider, amount_paise, currency, status, gateway_order_id, gateway_payment_id, verified_at, created_at, updated_at, orders(order_number)')
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw paymentError(503, 'Payment history is temporarily unavailable', error);
  return data;
}
