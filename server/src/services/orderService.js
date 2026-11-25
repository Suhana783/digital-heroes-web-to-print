import { getServiceRoleSupabaseClient } from '../config/supabase.js';
import { calculatePrice } from './pricing.service.js';

const MAX_ORDER_CENTS = 999_999_999_999n;

function serviceError(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function amountToCents(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw serviceError(503, 'A current price could not be verified');
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}

function centsToAmount(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

function optionSnapshot(result) {
  return [
    ...result.option_adjustments.map((adjustment) => ({
      option_group_id: adjustment.option_group_id,
      option_group_name: adjustment.option_group_name,
      option_value_id: adjustment.option_value_id,
      label: adjustment.label,
      adjustment_type: adjustment.adjustment_type,
      configured_adjustment: adjustment.configured_adjustment,
    })),
    ...result.custom_inputs.map((input) => ({
      option_group_id: input.option_group_id,
      option_group_name: input.option_group_name,
      input_type: input.input_type,
      value: input.value,
    })),
  ];
}

export async function validateOwnedDesignForProduct(client, customerId, designId, productId) {
  if (!designId) return null;
  const { data, error } = await client.from('customer_designs')
    .select('id, customer_id, product_id')
    .eq('id', designId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw serviceError(503, 'Saved design details are temporarily unavailable', error);
  if (!data || data.customer_id !== customerId) throw serviceError(400, 'The selected saved design is not available to this customer');
  if (data.product_id !== productId) throw serviceError(400, 'The selected saved design belongs to a different product');
  return data.id;
}

export async function ensureOrderDesignLinkSchema(client) {
  const { error } = await client.from('order_items').select('customer_design_id').limit(0);
  if (error) throw serviceError(503, 'Saved designs cannot be attached to orders until the saved-design order-link migration is applied', error);
}

export async function createCustomerOrder(user, orderInput) {
  const pricedItems = [];
  let subtotalCents = 0n;
  let currency;
  const client = getServiceRoleSupabaseClient();
  if (orderInput.items.some((item) => item.designId)) await ensureOrderDesignLinkSchema(client);

  for (const item of orderInput.items) {
    const price = await calculatePrice({
      productId: item.productId,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions,
      customInputs: item.customInputs,
    });
    if (currency && currency !== price.currency) throw serviceError(503, 'Order items use inconsistent currencies');
    currency = price.currency;
    const lineTotalCents = amountToCents(price.subtotal);
    subtotalCents += lineTotalCents;
    if (lineTotalCents > MAX_ORDER_CENTS || subtotalCents > MAX_ORDER_CENTS) {
      throw serviceError(400, 'The order amount exceeds the supported maximum');
    }
    const customerDesignId = await validateOwnedDesignForProduct(client, user.id, item.designId, price.product.id);
    pricedItems.push({
      product_id: price.product.id,
      customer_design_id: customerDesignId,
      product_name: price.product.name,
      quantity: price.quantity,
      unit_price: price.final_unit_price,
      line_total: price.subtotal,
      selected_options: optionSnapshot(price),
    });
  }

  const subtotal = centsToAmount(subtotalCents);
  const contactSnapshot = {
    full_name: orderInput.contact.full_name,
    email: user.email,
    phone: orderInput.contact.phone,
  };
  const { data, error } = await client.rpc('create_order_with_items', {
    p_customer_id: user.id,
    p_idempotency_key: orderInput.idempotencyKey,
    p_subtotal: subtotal,
    p_total_amount: subtotal,
    p_currency: currency || process.env.PRICE_CURRENCY || 'INR',
    p_delivery_address: orderInput.deliveryAddress,
    p_contact_snapshot: contactSnapshot,
    p_items: pricedItems,
  });

  if (error?.code === '23514' && error.message?.includes('Saved designs must belong')) {
    throw serviceError(400, 'The selected saved design must belong to your account and match the ordered product', error);
  }
  if (error) throw serviceError(503, 'Order placement is temporarily unavailable. No order was placed.', error);
  return data;
}

function orderReadFailure(error) {
  throw serviceError(503, 'Order history is temporarily unavailable', error);
}

const ORDER_SELECT = `
  id, order_number, customer_id, status, production_stage, payment_status, subtotal, total_amount, currency,
  delivery_address, contact_snapshot, created_at, updated_at,
  order_items(id, product_id, customer_design_id, product_name, quantity, unit_price, line_total, selected_options, created_at,
    customer_design:customer_designs(id, name, template_id, product_templates(name)))
`;

export async function listCustomerOrders(client, customerId) {
  const { data, error } = await client.from('orders')
    .select(ORDER_SELECT)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) orderReadFailure(error);
  return data;
}

export async function getCustomerOrder(client, customerId, orderId) {
  const { data, error } = await client.from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) orderReadFailure(error);
  return data;
}
