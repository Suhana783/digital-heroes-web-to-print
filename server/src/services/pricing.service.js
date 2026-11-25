import { getSupabaseClient } from '../config/supabase.js';
import { calculateProductPrice } from './pricingCalculator.js';

function requestError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function databaseFailure(error) {
  const failure = requestError(503, 'Pricing is temporarily unavailable. Please try again.');
  failure.cause = error;
  return failure;
}

export async function calculatePrice(request) {
  const { data, error } = await getSupabaseClient()
    .from('products')
    .select(`
      id, name, base_price, pricing_model,
      product_divisions!inner(is_active),
      product_option_groups(
        id, name, input_type, is_required,
        product_option_values(id, label, price_adjustment, adjustment_type, is_active)
      ),
      product_quantity_tiers(id, min_quantity, max_quantity, unit_price)
    `)
    .eq('id', request.productId)
    .eq('is_active', true)
    .eq('product_divisions.is_active', true)
    .maybeSingle();

  if (error) throw databaseFailure(error);
  if (!data) throw requestError(404, 'Active product not found');

  const groups = (data.product_option_groups || []).map((group) => ({
    ...group,
    product_option_values: (group.product_option_values || []).filter((value) => value.is_active),
  }));
  const product = {
    id: data.id,
    name: data.name,
    base_price: data.base_price,
    pricing_model: data.pricing_model,
  };
  const currency = process.env.PRICE_CURRENCY || 'INR';
  if (!/^[A-Z]{3}$/.test(currency)) throw requestError(503, 'Pricing currency configuration is invalid');

  try {
    return calculateProductPrice({
      product,
      groups,
      tiers: data.product_quantity_tiers || [],
      quantity: request.quantity,
      selectedOptions: request.selectedOptions,
      customInputs: request.customInputs,
      currency,
    });
  } catch (calculationError) {
    if (calculationError.statusCode) throw calculationError;
    throw databaseFailure(calculationError);
  }
}
