import { randomUUID } from 'node:crypto';
import { getServiceRoleSupabaseClient, getSupabaseClient } from '../config/supabase.js';
import { templateSnapshot, validateDesignElements, validateTemplateInput } from '../validators/designerValidators.js';

const BUCKET = 'designer-assets';
const TEMPLATE_FIELDS = 'id, product_id, name, canvas_width, canvas_height, printable_x, printable_y, printable_width, printable_height, background_color, allowed_elements, placeholder_config, is_active, created_at, updated_at';
const ASSET_FIELDS = 'id, design_id, original_filename, mime_type, file_size, is_previewable, created_at';
const SIGNED_SECONDS = 60;

function serviceError(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function dbFailure(error, message) {
  if (!error) return;
  throw serviceError(error.code === '23505' ? 409 : 503,
    error.code === '23505' ? 'A template with that name already exists for this product' : message, error);
}

export async function listDesignerProducts() {
  const { data, error } = await getSupabaseClient().from('products')
    .select('id, name, slug, product_divisions!inner(name, slug, is_active)')
    .eq('is_active', true)
    .eq('product_divisions.is_active', true)
    .order('name');
  dbFailure(error, 'Available products are temporarily unavailable');
  return data.map((product) => ({ ...product, division: product.product_divisions }));
}

export async function listAvailableTemplates(productId) {
  let query = getSupabaseClient().from('product_templates')
    .select(`${TEMPLATE_FIELDS}, products!inner(is_active)`)
    .eq('is_active', true)
    .eq('products.is_active', true)
    .order('name');
  if (productId) query = query.eq('product_id', productId);
  const { data, error } = await query;
  dbFailure(error, 'Available templates are temporarily unavailable');
  return data.map(({ products: _product, ...template }) => template);
}

export async function listAdminTemplateProducts() {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('products')
    .select('id, name, slug, is_active, product_divisions(name, slug)')
    .order('name');
  dbFailure(error, 'Products are temporarily unavailable');
  return data;
}

export async function listAdminTemplates() {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('product_templates')
    .select(`${TEMPLATE_FIELDS}, products!inner(name, slug, product_divisions(name, slug))`)
    .order('created_at', { ascending: false });
  dbFailure(error, 'Templates are temporarily unavailable');
  return data;
}

export async function saveProductTemplate(input, templateId = null) {
  const payload = validateTemplateInput(input);
  const client = getServiceRoleSupabaseClient();
  const { data: product, error: productError } = await client.from('products')
    .select('id').eq('id', payload.product_id).maybeSingle();
  dbFailure(productError, 'Product details are temporarily unavailable');
  if (!product) throw serviceError(404, 'Product not found');

  let query = templateId
    ? client.from('product_templates').update(payload).eq('id', templateId)
    : client.from('product_templates').insert(payload);
  const { data, error } = await query.select(TEMPLATE_FIELDS).maybeSingle();
  dbFailure(error, 'Template could not be saved');
  if (!data) throw serviceError(404, 'Template not found');
  return data;
}

async function readOwnedDesign(client, customerId, designId) {
  const { data, error } = await client.from('customer_designs')
    .select('id, customer_id, product_id, template_id, name, design_data, created_at, updated_at')
    .eq('id', designId).eq('customer_id', customerId).maybeSingle();
  if (error) throw serviceError(503, 'Saved design details are temporarily unavailable', error);
  if (!data) throw serviceError(404, 'Saved design not found');
  return data;
}

async function listOwnedAssets(client, customerId, designId) {
  const { data, error } = await client.from('design_assets')
    .select(`${ASSET_FIELDS}, storage_path`)
    .eq('customer_id', customerId).eq('design_id', designId)
    .order('created_at');
  if (error) throw serviceError(503, 'Design files are temporarily unavailable', error);
  return data;
}

async function presentAssets(client, assets) {
  return Promise.all(assets.map(async ({ storage_path: storagePath, ...asset }) => {
    if (!asset.is_previewable) return { ...asset, preview_url: null };
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_SECONDS);
    if (error || !data?.signedUrl) throw serviceError(503, 'A secure image preview could not be created', error);
    return { ...asset, preview_url: data.signedUrl };
  }));
}

export async function createCustomerDesign(customerId, { templateId, name }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateId || '')) {
    throw serviceError(400, 'Choose a valid product template');
  }
  const client = getServiceRoleSupabaseClient();
  const { data: template, error: templateError } = await client.from('product_templates')
    .select(`${TEMPLATE_FIELDS}, products!inner(is_active)`)
    .eq('id', templateId).eq('is_active', true).eq('products.is_active', true).maybeSingle();
  if (templateError) throw serviceError(503, 'Template details are temporarily unavailable', templateError);
  if (!template) throw serviceError(404, 'Active template not found');
  const designName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : 'Untitled design';
  const designData = { template: templateSnapshot(template), elements: [] };
  const { data, error } = await client.from('customer_designs').insert({
    customer_id: customerId,
    product_id: template.product_id,
    template_id: template.id,
    name: designName,
    design_data: designData,
  }).select('id, name, product_id, template_id, design_data, created_at, updated_at').single();
  dbFailure(error, 'Design could not be created');
  return { ...data, assets: [] };
}

export async function listCustomerDesigns(customerId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('customer_designs')
    .select('id, name, product_id, template_id, design_data, created_at, updated_at, products(name, slug), product_templates(name)')
    .eq('customer_id', customerId).order('updated_at', { ascending: false });
  dbFailure(error, 'Saved designs are temporarily unavailable');
  return data.map((design) => ({
    ...design,
    product: design.products,
    template: design.product_templates,
  })).map(({ products: _products, product_templates: _templates, ...design }) => design);
}

export async function getCustomerDesign(customerId, designId) {
  const client = getServiceRoleSupabaseClient();
  const design = await readOwnedDesign(client, customerId, designId);
  const [assets, { data: context, error: contextError }] = await Promise.all([
    listOwnedAssets(client, customerId, designId),
    client.from('customer_designs').select('products(name, slug), product_templates(name)').eq('id', designId).eq('customer_id', customerId).single(),
  ]);
  if (contextError) throw serviceError(503, 'Design product details are temporarily unavailable', contextError);
  return { ...design, product: context.products, template: context.product_templates, assets: await presentAssets(client, assets) };
}

export async function updateCustomerDesign(customerId, designId, input = {}) {
  if (Object.keys(input).some((key) => !['name', 'elements'].includes(key))) throw serviceError(400, 'Only the design name and elements can be changed');
  const client = getServiceRoleSupabaseClient();
  const current = await readOwnedDesign(client, customerId, designId);
  const assets = await listOwnedAssets(client, customerId, designId);
  const template = current.design_data.template;
  const elements = validateDesignElements(input.elements, template, assets);
  const name = input.name === undefined ? current.name : typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw serviceError(400, 'Design name must be between 1 and 120 characters');
  const designData = { template, elements };
  const { data, error } = await client.from('customer_designs').update({ name, design_data: designData })
    .eq('id', designId).eq('customer_id', customerId)
    .select('id, name, product_id, template_id, design_data, created_at, updated_at').single();
  dbFailure(error, 'Design could not be saved');
  return { ...data, assets: await presentAssets(client, assets) };
}

export async function deleteCustomerDesign(customerId, designId) {
  const client = getServiceRoleSupabaseClient();
  await readOwnedDesign(client, customerId, designId);
  const { data: linkedItems, error: linkedItemsError } = await client.from('order_items')
    .select('id').eq('customer_design_id', designId).limit(1);
  if (linkedItemsError) throw serviceError(503, 'Saved design order links could not be checked', linkedItemsError);
  if (linkedItems?.length) throw serviceError(409, 'This saved design is attached to an order and cannot be deleted');
  const assets = await listOwnedAssets(client, customerId, designId);
  const { data: outputs, error: outputsError } = await client.from('variable_data_outputs')
    .select('storage_path').eq('customer_id', customerId).eq('design_id', designId);
  if (outputsError && !['42P01', 'PGRST205'].includes(outputsError.code)) {
    throw serviceError(503, 'Generated design files could not be listed for deletion', outputsError);
  }
  if (assets.length) {
    const { error: removeError } = await client.storage.from(BUCKET).remove(assets.map((asset) => asset.storage_path));
    if (removeError) throw serviceError(503, 'Saved design files could not be removed', removeError);
  }
  if (outputs?.length) {
    for (let index = 0; index < outputs.length; index += 100) {
      const paths = outputs.slice(index, index + 100).map((output) => output.storage_path);
      const { error: removeError } = await client.storage.from('generated-print-files').remove(paths);
      if (removeError) throw serviceError(503, 'Generated PDFs could not be removed', removeError);
    }
  }
  const { error } = await client.from('customer_designs').delete().eq('id', designId).eq('customer_id', customerId);
  if (error?.code === '23503') throw serviceError(409, 'This saved design is attached to an order and cannot be deleted', error);
  dbFailure(error, 'Design could not be deleted');
}

export async function uploadCustomerDesignAsset(customerId, designId, input) {
  const client = getServiceRoleSupabaseClient();
  await readOwnedDesign(client, customerId, designId);
  const storagePath = `${customerId}/${designId}/${randomUUID()}${input.extension}`;
  const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, input.buffer, {
    contentType: input.mimeType, cacheControl: '3600', upsert: false,
  });
  if (uploadError) throw serviceError(503, 'Design file storage is temporarily unavailable', uploadError);
  const { data, error } = await client.from('design_assets').insert({
    design_id: designId,
    customer_id: customerId,
    original_filename: input.originalFilename,
    storage_path: storagePath,
    mime_type: input.mimeType,
    file_size: input.size,
    is_previewable: input.previewable,
  }).select(`${ASSET_FIELDS}, storage_path`).single();
  if (error) {
    await client.storage.from(BUCKET).remove([storagePath]);
    throw serviceError(503, 'Design file details could not be saved', error);
  }
  return (await presentAssets(client, [data]))[0];
}

export async function downloadCustomerDesignAsset(customerId, designId, assetId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('design_assets')
    .select('storage_path, original_filename')
    .eq('id', assetId).eq('design_id', designId).eq('customer_id', customerId).maybeSingle();
  if (error) throw serviceError(503, 'Design file access is temporarily unavailable', error);
  if (!data) throw serviceError(404, 'Design file not found');
  const { data: signed, error: signedError } = await client.storage.from(BUCKET)
    .createSignedUrl(data.storage_path, SIGNED_SECONDS, { download: data.original_filename });
  if (signedError || !signed?.signedUrl) throw serviceError(503, 'A secure design-file link could not be created', signedError);
  return { url: signed.signedUrl, expiresIn: SIGNED_SECONDS };
}

