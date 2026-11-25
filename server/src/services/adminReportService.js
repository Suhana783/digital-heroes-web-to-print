import { getServiceRoleSupabaseClient } from '../config/supabase.js';

const STAGES = ['quote', 'order', 'artwork', 'proof', 'production', 'completed'];

function failure(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function queryError(error, message) {
  if (error) throw failure(503, message, error);
}

function cents(value) {
  const match = String(value ?? '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')) : 0n;
}

function dateFilter(query, range) {
  let filtered = query;
  if (range.from) filtered = filtered.gte('created_at', range.from);
  if (range.until) filtered = filtered.lt('created_at', range.until);
  return filtered;
}

function buildOrderMetrics(orders) {
  const stageCounts = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  const statusCounts = {};
  const values = new Map();
  const productGroups = new Map();
  const divisionGroups = new Map();

  for (const order of orders) {
    const stage = order.production_stage || 'order';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    if (order.status !== 'cancelled') values.set(order.currency, (values.get(order.currency) || 0n) + cents(order.total_amount));
    for (const item of order.order_items || []) {
      const productId = item.product_id || `name:${item.product_name}`;
      const product = productGroups.get(productId) || {
        id: item.product_id,
        name: item.product_name,
        orders: new Set(),
        units: 0,
      };
      product.orders.add(order.id);
      product.units += Number(item.quantity) || 0;
      productGroups.set(productId, product);

      const division = item.products?.product_divisions;
      if (division?.name) {
        const divisionKey = division.slug || division.name;
        const divisionMetric = divisionGroups.get(divisionKey) || { name: division.name, slug: division.slug, orders: new Set(), units: 0 };
        divisionMetric.orders.add(order.id);
        divisionMetric.units += Number(item.quantity) || 0;
        divisionGroups.set(divisionKey, divisionMetric);
      }
    }
  }

  const ranked = (groups) => [...groups.values()].map((row) => ({ ...row, orders: row.orders.size }))
    .sort((a, b) => b.orders - a.orders || b.units - a.units).slice(0, 5);
  return {
    ordersReceived: orders.length,
    ordersByStage: stageCounts,
    ordersByStatus: statusCounts,
    completedOrders: statusCounts.completed || 0,
    cancelledOrders: statusCounts.cancelled || 0,
    orderValueByCurrency: [...values.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, total]) => ({ currency, amount: `${total / 100n}.${String(total % 100n).padStart(2, '0')}` })),
    topProducts: ranked(productGroups),
    topDivisions: ranked(divisionGroups),
  };
}

async function csvBatchMetrics(client, range) {
  let query = client.from('variable_data_batches').select(`
    id, customer_id, design_id, original_csv_filename, total_rows, successful_outputs, status, created_at,
    customer_designs(name, products(name))
  `).order('created_at', { ascending: false });
  query = dateFilter(query, range);
  const { data, error } = await query;
  if (error?.code === 'PGRST205' || error?.code === '42P01') return { available: false, totalBatches: null, generatedOutputs: null, recentBatches: [] };
  queryError(error, 'CSV batch reports are temporarily unavailable');
  return {
    available: true,
    totalBatches: data.length,
    generatedOutputs: data.reduce((sum, batch) => sum + (Number(batch.successful_outputs) || 0), 0),
    recentBatches: data.slice(0, 10).map((batch) => ({
      id: batch.id,
      designName: batch.customer_designs?.name || 'Saved design',
      productName: batch.customer_designs?.products?.name || 'Product',
      originalCsvFilename: batch.original_csv_filename,
      totalRows: batch.total_rows,
      successfulOutputs: batch.successful_outputs,
      status: batch.status,
      createdAt: batch.created_at,
    })),
  };
}

export async function getAdminReport({ from = null, until = null, period = 'all' } = {}) {
  const client = getServiceRoleSupabaseClient();
  const range = { from, until };
  const ordersQuery = dateFilter(client.from('orders').select(`
    id, order_number, status, production_stage, total_amount, currency, created_at,
    order_items(product_id, product_name, quantity, products(product_divisions(name, slug)))
  `), range);
  const [ordersResult, allOrdersResult, customersResult, productCountResult, divisionCountResult, csvBatches] = await Promise.all([
    ordersQuery.order('created_at', { ascending: false }),
    client.from('orders').select('id', { count: 'exact', head: true }),
    client.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'customer'),
    client.from('products').select('id', { count: 'exact', head: true }),
    client.from('product_divisions').select('id', { count: 'exact', head: true }),
    csvBatchMetrics(client, range),
  ]);
  queryError(ordersResult.error, 'Order reports are temporarily unavailable');
  queryError(allOrdersResult.error, 'Order count is temporarily unavailable');
  queryError(customersResult.error, 'Customer count is temporarily unavailable');
  queryError(productCountResult.error, 'Product count is temporarily unavailable');
  queryError(divisionCountResult.error, 'Division count is temporarily unavailable');

  return {
    range: { period, from, untilExclusive: until },
    totalOrders: allOrdersResult.count || 0,
    totalCustomers: customersResult.count || 0,
    totalProducts: productCountResult.count || 0,
    totalDivisions: divisionCountResult.count || 0,
    ...buildOrderMetrics(ordersResult.data || []),
    csvBatches,
  };
}
