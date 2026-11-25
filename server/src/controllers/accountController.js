import { getProfile, listCustomerOrders, updateProfile } from '../services/accountService.js';

export async function readProfile(request, response, next) {
  try {
    const profile = await getProfile(request.userSupabase, request.user.id);
    if (!profile) return response.status(404).json({ success: false, message: 'Customer profile not found' });
    response.status(200).json({ success: true, message: 'Profile retrieved successfully', data: profile });
  } catch (error) {
    next(error);
  }
}

export async function patchProfile(request, response, next) {
  try {
    const profile = await updateProfile(request.userSupabase, request.user.id, request.profileUpdates);
    response.status(200).json({ success: true, message: 'Profile updated successfully', data: profile });
  } catch (error) {
    next(error);
  }
}

export async function readOrders(request, response, next) {
  try {
    const orders = await listCustomerOrders(request.userSupabase, request.user.id);
    response.status(200).json({ success: true, message: orders.length ? 'Orders retrieved successfully' : 'No orders yet', data: orders });
  } catch (error) {
    next(error);
  }
}
