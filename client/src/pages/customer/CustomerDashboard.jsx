import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { accountRequest } from '../../services/accountApi.js';

function orderTotal(order) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(Number(order.total_amount)); }
  catch { return `${order.currency} ${order.total_amount}`; }
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const resource = useResource(async () => {
    const [profile, orders] = await Promise.all([accountRequest('/account/profile'), accountRequest('/orders')]);
    return { profile, orders };
  });

  return <SiteLayout><main className="account-page page-gutter">
    <p className="eyebrow">CUSTOMER ACCOUNT</p><h1>Your workshop<br /><em>space.</em></h1>
    <RequestState loading={resource.loading} error={resource.error} onRetry={resource.retry}>
      {resource.data && <>
        <section className="account-welcome"><div><span className="state-kicker">WELCOME BACK</span><h2>{resource.data.profile.full_name}</h2><p>{resource.data.profile.email}</p></div><Link className="text-link" to="/account/profile">Edit profile <span>↗</span></Link></section>
        <section className="account-section"><div className="catalogue-subheading"><h2>My orders</h2><Link className="text-link" to="/account/orders">Order history <span>↗</span></Link></div>
          {resource.data.orders.length ? <div className="account-order-list">{resource.data.orders.slice(0, 3).map((order) => <article className="account-order" key={order.id}><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div><span className="order-status">{order.status.replaceAll('_', ' ')}</span><strong>{orderTotal(order)}</strong><Link to={`/account/orders/${order.id}`}>View <span aria-hidden="true">↗</span></Link></article>)}</div> : <div className="account-empty"><p>You haven’t placed any orders yet.</p><Link className="text-link" to="/">Explore products <span>↗</span></Link></div>}
        </section>
        <div className="account-shortcuts"><Link to="/account/profile">Profile details <span>↗</span></Link><Link to="/account/orders">View order history <span>↗</span></Link><Link to="/account/designs">Saved designs <span>↗</span></Link><Link to="/account/variable-data">CSV artwork merge <span>↗</span></Link></div>
      </>}
    </RequestState>
    {!resource.loading && resource.error?.status === 404 && user && <p className="account-note">Your profile may still be setting up. Try again in a moment.</p>}
  </main></SiteLayout>;
}
