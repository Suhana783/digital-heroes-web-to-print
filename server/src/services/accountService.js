function accountDatabaseError(error) {
  const failure = new Error('Account data is temporarily unavailable');
  failure.statusCode = 503;
  failure.cause = error;
  throw failure;
}

export async function getProfile(client, userId) {
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, email, phone, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) accountDatabaseError(error);
  return data;
}

export async function updateProfile(client, userId, updates) {
  const { data, error } = await client
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, full_name, email, phone, created_at, updated_at')
    .single();
  if (error) accountDatabaseError(error);
  return data;
}

export async function listCustomerOrders(client, userId) {
  const { data, error } = await client
    .from('orders')
    .select('id, order_number, status, subtotal, total_amount, currency, created_at')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });
  if (error) accountDatabaseError(error);
  return data;
}
