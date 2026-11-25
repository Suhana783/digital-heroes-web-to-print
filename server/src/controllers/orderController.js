import { createCustomerOrder, getCustomerOrder, listCustomerOrders } from '../services/orderService.js';

export async function createOrder(request, response, next) {
  try {
    const order = await createCustomerOrder(request.user, request.orderInput);
    response.status(201).json({ success: true, message: 'Order placed successfully', data: order });
  } catch (error) {
    next(error);
  }
}

export async function listOrders(request, response, next) {
  try {
    const orders = await listCustomerOrders(request.userSupabase, request.user.id);
    response.status(200).json({ success: true, message: orders.length ? 'Orders retrieved successfully' : 'No orders yet', data: orders });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(request, response, next) {
  try {
    const order = await getCustomerOrder(request.userSupabase, request.user.id, request.params.orderId);
    if (!order) return response.status(404).json({ success: false, message: 'Order not found' });
    response.status(200).json({ success: true, message: 'Order retrieved successfully', data: order });
  } catch (error) {
    next(error);
  }
}

