const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reject(response, message) {
  return response.status(400).json({ success: false, message });
}

function validObject(body, allowed) {
  return body && typeof body === 'object' && !Array.isArray(body)
    && !Object.keys(body).some((key) => !allowed.includes(key));
}

function validateIdentifiers(body) {
  return uuidPattern.test(body?.orderId || '') && uuidPattern.test(body?.paymentOrderId || '');
}

export function validateCreatePaymentOrder(request, response, next) {
  if (!validObject(request.body, ['orderId']) || !uuidPattern.test(request.body?.orderId || '')) {
    return reject(response, 'A valid orderId is required');
  }
  next();
}

export function validatePaymentStatusOrder(request, response, next) {
  if (!uuidPattern.test(request.params.orderId || '')) return reject(response, 'A valid order ID is required');
  next();
}

export function validateRazorpayPaymentVerification(request, response, next) {
  const body = request.body;
  const allowed = ['orderId', 'paymentOrderId', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'];
  if (!validObject(body, allowed) || !validateIdentifiers(body)
    || typeof body.razorpay_order_id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id)
    || typeof body.razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id)
    || typeof body.razorpay_signature !== 'string' || !/^[a-f0-9]{64}$/i.test(body.razorpay_signature)) {
    return reject(response, 'A valid Razorpay payment response is required');
  }
  next();
}

export function validateMockSimulation(request, response, next) {
  const body = request.body;
  if (!validObject(body, ['orderId', 'paymentOrderId', 'outcome']) || !validateIdentifiers(body)
    || !['success', 'failure'].includes(body.outcome)) {
    return reject(response, 'Choose a valid local payment result');
  }
  next();
}

export function validateRazorpayFailure(request, response, next) {
  const body = request.body;
  const allowed = ['orderId', 'paymentOrderId', 'reason'];
  if (!validObject(body, allowed) || !validateIdentifiers(body)
    || !['checkout_dismissed', 'payment_failed'].includes(body.reason)) {
    return reject(response, 'A valid failed payment attempt is required');
  }
  next();
}
