import { getSupabaseClient } from '../config/supabase.js';

function throwDatabaseError(error) {
  const serviceError = new Error('Catalogue data could not be retrieved');
  serviceError.statusCode = 503;
  serviceError.cause = error;
  throw serviceError;
}

function validateSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export async function getActiveDivisions() {
  const { data, error } = await getSupabaseClient()
    .from('product_divisions')
    .select('id, name, slug, description, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throwDatabaseError(error);
  return data;
}

export async function getProductsByDivisionSlug(divisionSlug) {
  if (!validateSlug(divisionSlug)) return null;

  const client = getSupabaseClient();
  const { data: division, error: divisionError } = await client
    .from('product_divisions')
    .select('id, name, slug, description')
    .eq('slug', divisionSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (divisionError) throwDatabaseError(divisionError);
  if (!division) return null;

  const { data: products, error } = await client
    .from('products')
    .select('id, name, slug, description, base_price, pricing_model')
    .eq('division_id', division.id)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throwDatabaseError(error);
  return { division, products };
}

export async function getProductDetails(divisionSlug, productSlug) {
  if (!validateSlug(divisionSlug) || !validateSlug(productSlug)) return null;

  const { data, error } = await getSupabaseClient()
    .from('products')
    .select(`
      id, name, slug, description, base_price, pricing_model,
      product_divisions!inner(name, slug, is_active),
      product_option_groups(
        id, name, input_type, is_required, sort_order,
        product_option_values(id, label, price_adjustment, adjustment_type, is_active, sort_order)
      ),
      product_quantity_tiers(id, min_quantity, max_quantity, unit_price)
    `)
    .eq('slug', productSlug)
    .eq('is_active', true)
    .eq('product_divisions.slug', divisionSlug)
    .eq('product_divisions.is_active', true)
    .maybeSingle();

  if (error) throwDatabaseError(error);
  if (!data) return null;

  const division = Array.isArray(data.product_divisions) ? data.product_divisions[0] : data.product_divisions;
  const optionGroups = (data.product_option_groups || [])
    .map((group) => ({
      ...group,
      values: (group.product_option_values || [])
        .filter((value) => value.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ product_option_values: _values, ...group }) => group);
  const quantityTiers = (data.product_quantity_tiers || [])
    .sort((a, b) => a.min_quantity - b.min_quantity);

  const { product_divisions: _division, product_option_groups: _groups, product_quantity_tiers: _tiers, ...product } = data;
  return { ...product, division, option_groups: optionGroups, quantity_tiers: quantityTiers };
}
