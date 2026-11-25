import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { useResource } from '../../hooks/useResource.js';
import { accountRequest } from '../../services/accountApi.js';
import { formatCurrency } from '../../features/cart/cartUtils.js';

function orderNumber(attempt) {
  return attempt.orders?.order_number || attempt.order_id;
}

function paymentReference(attempt) {
  return attempt.gateway_payment_id || attempt.gateway_order_id;
}

export default function AdminPayments() {
  const payments = useResource(() => accountRequest('/admin/payments'));

  return <SiteLayout><main className="account-page page-gutter admin-payments-page">
    <Link className="back-link" to="/admin/reports">← Admin reports</Link>
    <p className="eyebrow">ADMIN / PAYMENT RECORDS</p><h1>Payment attempts</h1>
    <p className="proof-page-intro">Mock entries are simulations and do not represent money received. Razorpay entries use the payment status verified by the server.</p>
    <RequestState loading={payments.loading} error={payments.error} onRetry={payments.retry} empty={payments.data?.length === 0 && 'No payment attempts have been recorded yet.'}>
      {payments.data?.length > 0 && <div className="admin-payment-list">
        <div className="admin-payment-header" aria-hidden="true"><span>Order</span><span>Mode / status</span><span>Amount</span><span>Payment reference</span><span>Recorded</span></div>
        {payments.data.map((attempt) => <article className="admin-payment-row" key={attempt.id}>
          <span><strong>{orderNumber(attempt)}</strong><small>Attempt {attempt.id.slice(0, 8)}</small></span>
          <span><strong>{attempt.provider === 'mock' ? 'Mock sandbox' : 'Razorpay test'}</strong><small className={`order-status payment-status-${attempt.status}`}>{attempt.status.replaceAll('_', ' ')}</small></span>
          <strong>{formatCurrency(attempt.amount_paise / 100, attempt.currency)}</strong>
          <code>{paymentReference(attempt)}</code>
          <span><small>Created {new Date(attempt.created_at).toLocaleString()}</small><small>{attempt.verified_at ? `Verified ${new Date(attempt.verified_at).toLocaleString()}` : 'Not verified'}</small></span>
        </article>)}
      </div>}
    </RequestState>
  </main></SiteLayout>;
}
