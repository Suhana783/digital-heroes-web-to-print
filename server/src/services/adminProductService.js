import { getServiceRoleSupabaseClient } from '../config/supabase.js';

function failure(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

export async function setAdminProductActive(productId, isActive) {
  const { data, error } = await getServiceRoleSupabaseClient().from('products')
    .update({ is_active: isActive }).eq('id', productId)
    .select('id, name, slug, is_active, division_id').maybeSingle();
  if (error) throw failure(503, 'Product status could not be updated', error);
  if (!data) throw failure(404, 'Product not found');
  return data;
}
