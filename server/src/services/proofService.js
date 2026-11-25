import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { getServiceRoleSupabaseClient } from '../config/supabase.js';

const PROOF_BUCKET = 'order-proofs';
const PRINT_BUCKET = 'generated-print-files';
const URL_SECONDS = 60;
const PROOF_FIELDS = 'id, order_item_id, version_number, status, admin_notes, customer_feedback, created_by, created_at, updated_at, approved_at';
const EVENT_FIELDS = 'id, proof_id, event_type, actor_id, message, created_at';
const PRINT_FIELDS = 'id, order_item_id, source_artwork_id, approved_proof_id, original_filename, file_size, page_width_points, page_height_points, generation_status, metadata, created_by, created_at';

function failure(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function unwrap(data, error, message, statusCode = 503) {
  if (error) throw failure(statusCode, message, error);
  return data;
}

function proofResponse(proof) {
  return Object.fromEntries(Object.entries(proof).filter(([field]) => field !== 'proof_file_path'));
}

function safeSpecs(item) {
  return {
    product: item.product_name,
    quantity: item.quantity,
    selectedOptions: Array.isArray(item.selected_options) ? item.selected_options : [],
    dimensions: null,
    dimensionsNote: 'No structured product dimensions are configured for this item.',
  };
}

async function latestApprovedProof(client, orderItemId) {
  const { data, error } = await client.from('order_proofs')
    .select('id, version_number, status, proof_file_path')
    .eq('order_item_id', orderItemId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw failure(503, 'Proof approval status is temporarily unavailable', error);
  if (!data || data.status !== 'approved') {
    throw failure(409, 'The latest proof must be approved before generating or downloading a production file');
  }
  return data;
}

async function assertProductionFileEligible(client, file) {
  if (file.generation_status !== 'production_ready' || !file.approved_proof_id) {
    throw failure(409, 'This file is an unvalidated draft or has been superseded; it is not eligible for production');
  }
  const proof = await latestApprovedProof(client, file.order_item_id);
  if (proof.id !== file.approved_proof_id) {
    throw failure(409, 'This production file is no longer eligible because a different proof is current');
  }
  return proof;
}

export async function listAdminProofQueue() {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('orders').select(`
    id, order_number, customer_id, created_at,
    order_items(id, order_id, product_name, quantity, selected_options,
      artwork_files(id, original_filename, mime_type, file_size, order_item_id, created_at),
      order_proofs(id, version_number, status, created_at),
      print_files(id, approved_proof_id, generation_status))
  `).order('created_at', { ascending: false });
  unwrap(data, error, 'Proof queue is temporarily unavailable');

  return data.flatMap((order) => order.order_items.map((item) => {
    const latest = [...(item.order_proofs || [])].sort((a, b) => b.version_number - a.version_number)[0] || null;
    const artwork = item.artwork_files || [];
    const hasEligibleFile = (item.print_files || []).some((file) =>
      file.generation_status === 'production_ready' && file.approved_proof_id === latest?.id);
    return { orderId: order.id, orderNumber: order.order_number, customerId: order.customer_id, orderCreatedAt: order.created_at,
      item: { id: item.id, product_name: item.product_name, quantity: item.quantity, selected_options: item.selected_options },
      artworkCount: artwork.length, artwork, latestProof: latest, hasEligibleFile };
  }).filter((row) => !row.latestProof || row.latestProof.status === 'changes_requested'
    || (row.latestProof.status === 'approved' && !row.hasEligibleFile)));
}

async function readAdminItem(client, orderItemId) {
  const { data, error } = await client.from('order_items')
    .select(`id, order_id, product_id, customer_design_id, product_name, quantity, selected_options,
      customer_design:customer_designs(id, name, template_id, product_templates(name)),
      orders!inner(id, order_number, customer_id, created_at),
      artwork_files(id, order_id, order_item_id, original_filename, mime_type, file_size, storage_path, created_at),
      order_proofs(${PROOF_FIELDS}, proof_file_path, order_proof_events(${EVENT_FIELDS})),
      print_files(${PRINT_FIELDS}, storage_path)`)
    .eq('id', orderItemId).maybeSingle();
  if (error) throw failure(503, 'Order item details are temporarily unavailable', error);
  if (!data) throw failure(404, 'Order item not found');
  return data;
}

export async function getAdminProofItem(orderItemId) {
  const client = getServiceRoleSupabaseClient();
  const item = await readAdminItem(client, orderItemId);
  const { data: orderArtwork, error } = await client.from('artwork_files')
    .select('id, order_id, order_item_id, original_filename, mime_type, file_size, storage_path, created_at')
    .eq('order_id', item.order_id).is('order_item_id', null).order('created_at', { ascending: false });
  unwrap(orderArtwork, error, 'Order artwork is temporarily unavailable');
  return {
    order: item.orders,
    item: { id: item.id, order_id: item.order_id, product_id: item.product_id, product_name: item.product_name,
      quantity: item.quantity, selected_options: item.selected_options, customer_design: item.customer_design },
    artwork: [...(item.artwork_files || []).filter((file) => file.order_item_id === item.id), ...orderArtwork]
      .map(({ storage_path, ...file }) => file),
    proofs: [...(item.order_proofs || [])].sort((a, b) => a.version_number - b.version_number)
      .map(({ proof_file_path, ...proof }) => proof),
    printFiles: [...(item.print_files || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(({ storage_path, ...file }) => file),
    specifications: safeSpecs(item),
  };
}

export async function createProofVersion({ orderItemId, adminId, input }) {
  const client = getServiceRoleSupabaseClient();
  const storagePath = `${orderItemId}/${randomUUID()}.pdf`;
  const { error: uploadError } = await client.storage.from(PROOF_BUCKET).upload(storagePath, input.buffer, {
    contentType: 'application/pdf', cacheControl: '3600', upsert: false,
  });
  if (uploadError) throw failure(503, 'Proof storage is temporarily unavailable', uploadError);

  const { data, error } = await client.rpc('create_order_proof_version', {
    p_order_item_id: orderItemId,
    p_proof_file_path: storagePath,
    p_admin_notes: input.adminNotes,
    p_created_by: adminId,
  });
  if (error) {
    await client.storage.from(PROOF_BUCKET).remove([storagePath]);
    const missingItem = error.code === 'P0002';
    throw failure(missingItem ? 404 : error.code === '55000' ? 409 : 503,
      missingItem ? 'Order item not found' : error.code === '55000' ? 'This item is not ready for a new proof version' : 'Proof details could not be saved', error);
  }
  return proofResponse(data);
}

async function approvedProofBytes(client, proof) {
  const { data, error } = await client.storage.from(PROOF_BUCKET).download(proof.proof_file_path);
  if (error || !data) throw failure(503, 'The approved proof could not be read from private storage', error);
  return Buffer.from(await data.arrayBuffer());
}

function optionSummary(options) {
  return options.map((option) => {
    const name = option.option_group_name || 'Option';
    const value = option.label ?? option.value ?? '';
    return `${name}: ${value}`.slice(0, 180);
  });
}

export async function createDraftPdf(source, artwork, item) {
  if (artwork.mime_type === 'image/svg+xml') throw failure(400, 'SVG artwork cannot be generated into a PDF yet. Upload a PNG, JPG, or PDF file.');
  let document;
  let pageSize;
  if (artwork.mime_type === 'application/pdf') {
    const original = await PDFDocument.load(source, { updateMetadata: false });
    if (original.getPageCount() < 1 || original.getPageCount() > 40) throw failure(400, 'The source PDF must contain between 1 and 40 pages');
    document = await PDFDocument.create();
    const pages = await document.copyPages(original, original.getPageIndices());
    pages.forEach((page) => document.addPage(page));
    const first = pages[0].getSize();
    pageSize = { width: first.width, height: first.height };
  } else {
    document = await PDFDocument.create();
    const page = document.addPage([595.28, 841.89]);
    pageSize = page.getSize();
    const image = artwork.mime_type === 'image/png' ? await document.embedPng(source) : await document.embedJpg(source);
    const margin = 36;
    const box = { x: margin, y: margin, width: pageSize.width - 2 * margin, height: pageSize.height - 2 * margin };
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (pageSize.width - width) / 2, y: (pageSize.height - height) / 2, width, height });
  }

  document.setTitle(`Production output — ${item.product_name}`);
  document.setSubject(JSON.stringify({
    product: item.product_name,
    quantity: item.quantity,
    selectedOptions: Array.isArray(item.selected_options) ? item.selected_options : [],
    dimensions: null,
    status: 'Latest customer proof approved; dimensions and prepress have not been validated.',
  }).slice(0, 1500));
  document.setCreator('Digital Heroes Web-to-Print');
  return { bytes: Buffer.from(await document.save()), pageSize };
}

export async function generatePrintFile({ orderItemId, adminId }) {
  const client = getServiceRoleSupabaseClient();
  const item = await readAdminItem(client, orderItemId);
  const approvedProof = await latestApprovedProof(client, orderItemId);

  let draft;
  try {
    draft = await createDraftPdf(await approvedProofBytes(client, approvedProof), { mime_type: 'application/pdf' }, item);
  } catch (error) {
    if (error.statusCode) throw error;
    throw failure(400, 'The approved proof could not be read as a valid PDF', error);
  }
  if (draft.bytes.length < 1 || draft.bytes.length > 20 * 1024 * 1024) throw failure(413, 'The generated PDF is larger than the 20 MB storage limit');

  const storagePath = `${orderItemId}/${randomUUID()}.pdf`;
  const { error: uploadError } = await client.storage.from(PRINT_BUCKET).upload(storagePath, draft.bytes, {
    contentType: 'application/pdf', cacheControl: '3600', upsert: false,
  });
  if (uploadError) throw failure(503, 'Generated print-file storage is temporarily unavailable', uploadError);

  const specs = safeSpecs(item);
  const { data, error } = await client.from('print_files').insert({
    order_item_id: orderItemId,
    source_artwork_id: null,
    approved_proof_id: approvedProof.id,
    storage_path: storagePath,
    original_filename: `${item.product_name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'order-item'}-v${approvedProof.version_number}-production.pdf`,
    file_size: draft.bytes.length,
    page_width_points: draft.pageSize.width,
    page_height_points: draft.pageSize.height,
    generation_status: 'draft_unvalidated',
    metadata: { ...specs, approved_proof_version: approvedProof.version_number, margin_points: null, source_mime_type: 'application/pdf' },
    created_by: adminId,
  }).select(PRINT_FIELDS).single();
  if (error) {
    await client.storage.from(PRINT_BUCKET).remove([storagePath]);
    if (error.code === '23514') throw failure(409, 'The latest proof approval changed; generate the production file again after approval', error);
    throw failure(503, 'Generated print-file details could not be saved', error);
  }
  return data;
}

export async function validatePrintFile(printFileId) {
  const client = getServiceRoleSupabaseClient();
  const { data: file, error } = await client.from('print_files')
    .select('id, order_item_id, approved_proof_id, generation_status, storage_path, metadata')
    .eq('id', printFileId).maybeSingle();
  if (error) throw failure(503, 'Print-file access is temporarily unavailable', error);
  if (!file) throw failure(404, 'Print file not found');
  if (file.generation_status !== 'draft_unvalidated' || !file.approved_proof_id) {
    throw failure(409, 'Only a proof-linked unvalidated draft can be validated');
  }
  const proof = await latestApprovedProof(client, file.order_item_id);
  if (proof.id !== file.approved_proof_id) throw failure(409, 'The associated proof is no longer the latest approved proof');
  const { data: blob, error: downloadError } = await client.storage.from(PRINT_BUCKET).download(file.storage_path);
  if (downloadError || !blob) throw failure(503, 'The draft production PDF could not be read', downloadError);
  let pdf;
  try { pdf = await PDFDocument.load(Buffer.from(await blob.arrayBuffer()), { updateMetadata: false }); }
  catch (parseError) { throw failure(422, 'The production PDF failed document validation', parseError); }
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > 40) throw failure(422, 'The production PDF must contain between 1 and 40 pages');
  const firstPage = pdf.getPage(0).getSize();
  if (!(firstPage.width > 0 && firstPage.height > 0)) throw failure(422, 'The production PDF has invalid page dimensions');
  const { data, error: updateError } = await client.from('print_files').update({
    generation_status: 'production_ready',
    metadata: { ...file.metadata, validation: { type: 'pdf_structure', page_count: pdf.getPageCount(), validated_at: new Date().toISOString(), validated_proof_id: proof.id } },
  }).eq('id', printFileId).select(PRINT_FIELDS).single();
  if (updateError) throw failure(updateError.code === '23514' ? 409 : 503,
    updateError.code === '23514' ? 'The latest proof approval changed during validation' : 'Validation status could not be saved', updateError);
  return data;
}

export async function listCustomerOrderProofs(userClient, customerId, orderId) {
  const { data: order, error: orderError } = await userClient.from('orders').select('id').eq('id', orderId).eq('customer_id', customerId).maybeSingle();
  if (orderError) throw failure(503, 'Order details are temporarily unavailable', orderError);
  if (!order) throw failure(404, 'Order not found');
  const { data: orderItems, error: itemsError } = await userClient.from('order_items').select('id').eq('order_id', orderId);
  if (itemsError) throw failure(503, 'Order items are temporarily unavailable', itemsError);
  const itemIds = orderItems.map((item) => item.id);
  if (!itemIds.length) return { proofs: [], events: [] };
  const proofResult = await userClient.from('order_proofs')
    .select(PROOF_FIELDS).in('order_item_id', itemIds).order('version_number');
  unwrap(proofResult.data, proofResult.error, 'Proof history is temporarily unavailable');
  const proofIds = proofResult.data.map((proof) => proof.id);
  const eventResult = proofIds.length
    ? await userClient.from('order_proof_events').select(EVENT_FIELDS).in('proof_id', proofIds).order('created_at')
    : { data: [], error: null };
  unwrap(eventResult.data, eventResult.error, 'Proof history is temporarily unavailable');
  return { proofs: proofResult.data, events: eventResult.data };
}

export async function respondToProof(userClient, proofId, decision, feedback) {
  const { data, error } = await userClient.rpc('respond_to_order_proof', {
    p_proof_id: proofId, p_decision: decision, p_feedback: feedback || null,
  });
  if (error) throw failure(error.code === 'P0002' ? 404 : error.code === '55000' ? 409 : error.code === '42501' ? 401 : 503,
    error.code === 'P0002' ? 'Proof not found' : error.code === '55000' ? 'This proof is no longer awaiting a response' : 'Your proof response could not be saved', error);
  return proofResponse(data);
}

export async function customerProofDownload(userClient, proofId) {
  const { data: proof, error } = await userClient.from('order_proofs').select('proof_file_path').eq('id', proofId).maybeSingle();
  if (error) throw failure(503, 'Proof access is temporarily unavailable', error);
  if (!proof) throw failure(404, 'Proof not found');
  return signedUrl(PROOF_BUCKET, proof.proof_file_path);
}

async function signedUrl(bucket, path, filename) {
  const { data, error } = await getServiceRoleSupabaseClient().storage.from(bucket)
    .createSignedUrl(path, URL_SECONDS, filename ? { download: filename } : {});
  if (error || !data?.signedUrl) throw failure(503, 'A secure download link could not be created', error);
  return { url: data.signedUrl, expiresIn: URL_SECONDS };
}

export async function adminProofDownload(proofId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('order_proofs').select('proof_file_path').eq('id', proofId).maybeSingle();
  if (error) throw failure(503, 'Proof access is temporarily unavailable', error);
  if (!data) throw failure(404, 'Proof not found');
  return signedUrl(PROOF_BUCKET, data.proof_file_path, 'proof.pdf');
}

export async function adminArtworkDownload(artworkId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('artwork_files').select('storage_path, original_filename').eq('id', artworkId).maybeSingle();
  if (error) throw failure(503, 'Artwork access is temporarily unavailable', error);
  if (!data) throw failure(404, 'Artwork file not found');
  const { data: link, error: linkError } = await client.storage.from('customer-artwork')
    .createSignedUrl(data.storage_path, URL_SECONDS, { download: data.original_filename });
  if (linkError || !link?.signedUrl) throw failure(503, 'A secure artwork link could not be created', linkError);
  return { url: link.signedUrl, expiresIn: URL_SECONDS };
}

export async function adminPrintDownload(printFileId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('print_files')
    .select('storage_path, original_filename, order_item_id, approved_proof_id, generation_status')
    .eq('id', printFileId).maybeSingle();
  if (error) throw failure(503, 'Print-file access is temporarily unavailable', error);
  if (!data) throw failure(404, 'Print file not found');
  await assertProductionFileEligible(client, data);
  return signedUrl(PRINT_BUCKET, data.storage_path, data.original_filename);
}

