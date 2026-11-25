import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { useResource } from '../../hooks/useResource.js';
import { accountRequest } from '../../services/accountApi.js';

function total(order) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(Number(order.total_amount)); }
  catch { return `${order.currency} ${order.total_amount}`; }
}

export default function CustomerOrders() {
  const orders = useResource(() => accountRequest('/orders'));
  return <SiteLayout><main className="account-page page-gutter">
    <Link className="back-link" to="/account">← Account overview</Link><p className="eyebrow">YOUR ACTIVITY</p><h1>Order history</h1>
    <RequestState loading={orders.loading} error={orders.error} onRetry={orders.retry} empty={orders.data?.length === 0 && 'You haven’t placed any orders yet.'}>
      {orders.data?.length > 0 && <div className="account-order-list">{orders.data.map((order) => <article className="account-order" key={order.id}><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div><span className="order-status">{order.status.replaceAll('_', ' ')}</span><strong>{total(order)}</strong><Link to={`/account/orders/${order.id}`}>View details ↗</Link></article>)}</div>}
    </RequestState>
    <Link className="text-link orders-explore" to="/">Explore products <span>↗</span></Link>
  </main></SiteLayout>;
}
