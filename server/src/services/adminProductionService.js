import { getServiceRoleSupabaseClient } from '../config/supabase.js';

const STAGES = ['quote', 'order', 'artwork', 'proof', 'production', 'completed'];
function failure(statusCode, message, cause) { const error = new Error(message); error.statusCode = statusCode; if (cause) error.cause = cause; return error; }
function unwrap(data, error, message) { if (error) throw failure(503, message, error); return data; }

export function getProductionBlockReason(order, latestProof, printFiles = []) {
  if (latestProof?.status !== 'approved') return 'proof';
  if (order.payment_status !== 'paid') return 'payment';
  const hasCurrentValidatedFile = printFiles.some((file) =>
    file.generation_status === 'production_ready' && file.approved_proof_id === latestProof.id);
  return hasCurrentValidatedFile ? null : 'print_file';
}

export async function listProductionOrders() {
  const db = getServiceRoleSupabaseClient();
  const orders = unwrap(...Object.values(await db.from('orders').select(`
    id, order_number, customer_id, status, production_stage, payment_status, subtotal, total_amount, currency,
    delivery_address, contact_snapshot, created_at,
    order_items(id, product_id, customer_design_id, product_name, quantity, selected_options,
      customer_design:customer_designs(id, name, template_id, product_templates(name)), products(name, product_divisions(name)),
      order_proofs(id, version_number, status), print_files(id, approved_proof_id, generation_status))
  `).order('created_at', { ascending: false })).slice(0, 2), 'Orders are temporarily unavailable');
  const ids = [...new Set(orders.map((order) => order.customer_id))];
  const profiles = ids.length ? unwrap(...Object.values(await db.from('profiles').select('id, full_name, email').in('id', ids)).slice(0, 2), 'Customer information is temporarily unavailable') : [];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return orders.map((order) => ({ ...order, customer: byId.get(order.customer_id) || order.contact_snapshot,
    order_items: order.order_items.map((item) => {
      const proofs = [...(item.order_proofs || [])].sort((a, b) => b.version_number - a.version_number);
      const latest = proofs[0] || null;
      const productionBlockReason = getProductionBlockReason(order, latest, item.print_files || []);
      return { ...item, customer_design: item.customer_design || null, product_type: item.products?.product_divisions?.name || 'Unclassified', latest_proof: latest,
        ready_for_production: productionBlockReason === null, production_block_reason: productionBlockReason,
        print_files: (item.print_files || []).filter((file) => file.generation_status === 'production_ready' && file.approved_proof_id === latest?.id) };
    }) }));
}

export async function updateProductionStage(orderId, stage, actorId) {
  if (!STAGES.includes(stage)) throw failure(400, 'Invalid production stage');
  const db = getServiceRoleSupabaseClient();
  if (stage === 'production') {
    const { data: order, error: readError } = await db.from('orders').select(`
      id, payment_status,
      order_items(id, order_proofs(id, version_number, status), print_files(id, approved_proof_id, generation_status))
    `).eq('id', orderId).maybeSingle();
    if (readError) throw failure(503, 'Production readiness could not be checked', readError);
    if (!order) throw failure(404, 'Order not found');
    for (const item of order.order_items || []) {
      const latestProof = [...(item.order_proofs || [])].sort((a, b) => b.version_number - a.version_number)[0] || null;
      const reason = getProductionBlockReason(order, latestProof, item.print_files || []);
      if (reason === 'proof') throw failure(409, 'Every order item needs its latest proof approved before Production');
      if (reason === 'payment') throw failure(409, 'Payment must be verified before Production');
      if (reason === 'print_file') throw failure(409, 'Every order item needs a validated production file for its latest approved proof before Production');
    }
  }
  const { data, error } = await db.rpc('admin_update_order_stage', {
    p_order_id: orderId, p_new_stage: stage, p_actor_id: actorId,
  });
  if (error) throw failure(error.code === 'P0002' ? 404 : error.code === '55000' ? 409 : error.code === '22023' ? 400 : 503,
    error.code === 'P0002' ? 'Order not found' : error.code === '55000' ? error.message : error.code === '22023' ? 'Invalid production stage' : 'Order stage could not be updated', error);
  return data;
}
