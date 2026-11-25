import { randomUUID } from 'node:crypto';
import { getServiceRoleSupabaseClient } from '../config/supabase.js';

const BUCKET = 'customer-artwork';
const SIGNED_URL_SECONDS = 60;
const ARTWORK_FIELDS = 'id, order_id, order_item_id, original_filename, mime_type, file_size, upload_status, created_at, updated_at';

function serviceError(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

async function ensureCustomerOrder(userClient, customerId, orderId) {
  const { data, error } = await userClient.from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw serviceError(503, 'Order access is temporarily unavailable', error);
  if (!data) throw serviceError(404, 'Order not found');
}

export async function uploadOrderArtwork({ userClient, customerId, orderId, input }) {
  await ensureCustomerOrder(userClient, customerId, orderId);
  if (input.orderItemId) {
    const { data, error } = await userClient.from('order_items')
      .select('id')
      .eq('id', input.orderItemId)
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw serviceError(503, 'Order item access is temporarily unavailable', error);
    if (!data) throw serviceError(400, 'Choose an item that belongs to this order');
  }

  const adminClient = getServiceRoleSupabaseClient();
  const storagePath = `${customerId}/${orderId}/${randomUUID()}${input.extension}`;
  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(storagePath, input.buffer, {
    contentType: input.mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw serviceError(503, 'Artwork storage is temporarily unavailable', uploadError);

  try {
    const { data, error } = await adminClient.from('artwork_files').insert({
      customer_id: customerId,
      order_id: orderId,
      order_item_id: input.orderItemId,
      original_filename: input.originalFilename,
      storage_path: storagePath,
      mime_type: input.mimeType,
      file_size: input.size,
      upload_status: 'uploaded',
    }).select(ARTWORK_FIELDS).single();
    if (error) throw error;
    return data;
  } catch (error) {
    try {
      await adminClient.storage.from(BUCKET).remove([storagePath]);
    } catch {
      // Keep the API error generic; the storage path remains server-side.
    }
    throw serviceError(503, 'Artwork details could not be saved. The upload was cleaned up where possible.', error);
  }
}

export async function listOrderArtwork(userClient, customerId, orderId) {
  await ensureCustomerOrder(userClient, customerId, orderId);
  const { data, error } = await userClient.from('artwork_files')
    .select(ARTWORK_FIELDS)
    .eq('customer_id', customerId)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) throw serviceError(503, 'Artwork details are temporarily unavailable', error);
  return data;
}

export async function createArtworkDownloadUrl(userClient, customerId, artworkId) {
  const { data: artwork, error: metadataError } = await userClient.from('artwork_files')
    .select('storage_path, original_filename')
    .eq('id', artworkId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (metadataError) throw serviceError(503, 'Artwork access is temporarily unavailable', metadataError);
  if (!artwork) throw serviceError(404, 'Artwork file not found');

  const { data, error } = await getServiceRoleSupabaseClient().storage
    .from(BUCKET)
    .createSignedUrl(artwork.storage_path, SIGNED_URL_SECONDS, { download: artwork.original_filename });
  if (error || !data?.signedUrl) throw serviceError(503, 'A secure download link could not be created', error);
  return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS };
}
