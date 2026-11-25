import { calculatePrice } from '../services/pricing.service.js';

export async function calculateProductPrice(request, response, next) {
  try {
    const data = await calculatePrice(request.pricingInput);
    response.status(200).json({ success: true, message: 'Price calculated successfully', data });
  } catch (error) {
    next(error);
  }
}
