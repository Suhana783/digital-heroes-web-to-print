import { Link, useParams } from 'react-router-dom';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { useResource } from '../../hooks/useResource.js';
import { accountRequest } from '../../services/accountApi.js';
import { formatCurrency } from '../../features/cart/cartUtils.js';

export default function OrderReceipt() {
  const { orderId } = useParams();
  const result = useResource(() => accountRequest(`/orders/${encodeURIComponent(orderId)}`), [orderId]);
  const order = result.data;

  return <SiteLayout><main className="account-page page-gutter receipt-page">
    <Link className="back-link no-print" to={`/account/orders/${encodeURIComponent(orderId)}`}>← Order details</Link>
    <RequestState loading={result.loading} error={result.error} onRetry={result.retry}>
      {order && <article className="order-receipt">
        <header><div><p className="eyebrow">DIGITAL HEROES / ORDER RECEIPT</p><h1>Order {order.order_number}</h1><p>Placed {new Date(order.created_at).toLocaleString()}</p></div><button className="calculate-button no-print" type="button" onClick={() => window.print()}>Print / save as PDF <span>↗</span></button></header>
        <p className="receipt-disclaimer">Order summary only. This is not a tax invoice or proof of payment. Payment status: <strong>{order.payment_status}</strong>.</p>
        <div className="receipt-parties"><section><h2>Customer</h2><p>{order.contact_snapshot?.full_name || '—'}<br />{order.contact_snapshot?.email || ''}<br />{order.contact_snapshot?.phone || ''}</p></section><section><h2>Delivery</h2><p>{order.delivery_address?.address_line_1 || '—'}<br />{order.delivery_address?.address_line_2 || ''}<br />{[order.delivery_address?.city, order.delivery_address?.state, order.delivery_address?.postal_code].filter(Boolean).join(', ')}<br />{order.delivery_address?.country || ''}</p></section></div>
        <div className="receipt-items"><div className="receipt-table-heading"><span>Item</span><span>Qty</span><span>Line total</span></div>
          {order.order_items.map((item) => <article key={item.id}><div><strong>{item.product_name}</strong><small>{Array.isArray(item.selected_options) ? item.selected_options.map((option) => `${option.option_group_name}: ${option.label ?? option.value ?? ''}`).join(' · ') : ''}</small><small>Unit price {formatCurrency(item.unit_price, order.currency)}</small></div><span>{item.quantity}</span><strong>{formatCurrency(item.line_total, order.currency)}</strong></article>)}
        </div>
        <dl className="receipt-totals"><div><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal, order.currency)}</dd></div><div><dt>Order total</dt><dd>{formatCurrency(order.total_amount, order.currency)}</dd></div></dl>
        <footer><span>Order status: {order.status.replaceAll('_', ' ')}</span><span>Production stage: {(order.production_stage || 'order').replaceAll('_', ' ')}</span><span>Payment: {order.payment_status}</span></footer>
      </article>}
    </RequestState>
  </main></SiteLayout>;
}
