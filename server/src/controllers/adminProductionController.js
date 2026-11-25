import { listProductionOrders, updateProductionStage } from '../services/adminProductionService.js';

export async function getProductionOrders(_request, response, next) {
  try { const data = await listProductionOrders(); response.json({ success: true, message: 'Production orders retrieved', data }); }
  catch (error) { next(error); }
}

export async function putProductionStage(request, response, next) {
  try {
    const data = await updateProductionStage(request.params.orderId, request.body.stage, request.user.id);
    response.json({ success: true, message: 'Order stage updated', data });
  } catch (error) { next(error); }
}
