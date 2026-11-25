import { setAdminProductActive } from '../services/adminProductService.js';

export async function patchProductStatus(request, response, next) {
  if (!request.body || Object.keys(request.body).some((key) => key !== 'is_active') || typeof request.body.is_active !== 'boolean') {
    return response.status(400).json({ success: false, message: 'Product status must be set to true or false' });
  }
  try {
    const data = await setAdminProductActive(request.params.productId, request.body.is_active);
    response.status(200).json({ success: true, message: 'Product status updated', data });
  } catch (error) { next(error); }
}
