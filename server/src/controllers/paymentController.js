import {
  createPaymentOrder,
  failRazorpayPayment,
  getCustomerPaymentStatus,
  simulateMockPayment,
  verifyRazorpayPayment,
} from '../services/paymentService.js';

export async function postCreatePaymentOrder(request, response, next) {
  try {
    const data = await createPaymentOrder(request.user.id, request.body.orderId);
    response.status(201).json({ success: true, message: 'Payment order created', data });
  } catch (error) { next(error); }
}

export async function postVerifyPayment(request, response, next) {
  try {
    const data = await verifyRazorpayPayment(request.user.id, request.body);
    response.status(200).json({ success: true, message: 'Payment verified', data });
  } catch (error) { next(error); }
}

export async function postSimulateMockPayment(request, response, next) {
  try {
    const data = await simulateMockPayment(request.user.id, request.body);
    response.status(200).json({ success: true, message: 'Mock payment simulation completed', data });
  } catch (error) { next(error); }
}

export async function postPaymentFailure(request, response, next) {
  try {
    const data = await failRazorpayPayment(request.user.id, request.body);
    response.status(200).json({ success: true, message: 'Payment attempt failure recorded', data });
  } catch (error) { next(error); }
}

export async function getPaymentStatus(request, response, next) {
  try {
    const data = await getCustomerPaymentStatus(request.user.id, request.params.orderId);
    response.status(200).json({ success: true, message: 'Payment status retrieved', data });
  } catch (error) { next(error); }
}
