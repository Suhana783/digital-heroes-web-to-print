import { listAdminPaymentAttempts } from '../services/paymentService.js';

export async function getAdminPaymentAttempts(_request, response, next) {
  try {
    const data = await listAdminPaymentAttempts();
    response.status(200).json({ success: true, message: 'Payment history retrieved', data });
  } catch (error) { next(error); }
}
