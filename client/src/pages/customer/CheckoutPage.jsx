import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { CartLine } from '../../features/cart/CartLine.jsx';
import { cartSubtotal, formatCurrency, repriceCart } from '../../features/cart/cartUtils.js';
import { useCart } from '../../context/CartContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { accountRequest } from '../../services/accountApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyAddress = { addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '' };
let checkoutScriptPromise;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error('Razorpay Checkout could not be loaded.'));
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    document.head.appendChild(script);
  }).catch((error) => { checkoutScriptPromise = null; throw error; });
  return checkoutScriptPromise;
}

function makeIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export default function CheckoutPage() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const retryOrderId = searchParams.get('orderId');
  const keyRef = useRef(null);
  const [contact, setContact] = useState({ fullName: '', phone: '' });
  const [address, setAddress] = useState(emptyAddress);
  const [formError, setFormError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [mockPaymentOrder, setMockPaymentOrder] = useState(null);
  const [mockPaymentResult, setMockPaymentResult] = useState(null);
  const [simulatingPayment, setSimulatingPayment] = useState(false);
  const fingerprint = JSON.stringify({
    customerId: user?.id,
    items: cart.items.map(({ productId, quantity, selectedOptions, customInputs, designId }) => ({ productId, quantity, selectedOptions, customInputs, designId })),
  });
  if (!keyRef.current || keyRef.current.fingerprint !== fingerprint) {
    const storageKey = `digital-heroes-order-key:${fingerprint}`;
    let key;
    try { key = sessionStorage.getItem(storageKey); } catch { key = null; }
    key ||= makeIdempotencyKey();
    try { sessionStorage.setItem(storageKey, key); } catch { /* In-memory idempotency still protects repeated clicks. */ }
    keyRef.current = { fingerprint, storageKey, key };
  }
  const savedOrderKey = `${keyRef.current.storageKey}:order`;
  let savedApplicationOrderId = retryOrderId;
  if (!savedApplicationOrderId) {
    try { savedApplicationOrderId = sessionStorage.getItem(savedOrderKey); } catch { /* Storage may be unavailable. */ }
  }

  const checkoutData = useResource(async () => {
    const profileRequest = accountRequest('/account/profile');
    if (savedApplicationOrderId) {
      const [profile, savedOrder] = await Promise.all([
        profileRequest,
        accountRequest(`/orders/${encodeURIComponent(savedApplicationOrderId)}`),
      ]);
      return { profile, savedOrder, pricedItems: [] };
    }
    const [profile, pricedItems] = await Promise.all([profileRequest, repriceCart(cart.items)]);
    return { profile, savedOrder: null, pricedItems };
  }, [cart.items, savedApplicationOrderId]);

  useEffect(() => {
    if (!checkoutData.data?.profile) return;
    setContact({ fullName: checkoutData.data.profile.full_name || '', phone: checkoutData.data.profile.phone || '' });
  }, [checkoutData.data?.profile]);

  useEffect(() => {
    const savedOrder = checkoutData.data?.savedOrder;
    if (!savedOrder) return;
    setContact({ fullName: savedOrder.contact_snapshot?.full_name || '', phone: savedOrder.contact_snapshot?.phone || '' });
    setAddress({
      addressLine1: savedOrder.delivery_address?.address_line_1 || '',
      addressLine2: savedOrder.delivery_address?.address_line_2 || '',
      city: savedOrder.delivery_address?.city || '',
      state: savedOrder.delivery_address?.state || '',
      postalCode: savedOrder.delivery_address?.postal_code || '',
      country: savedOrder.delivery_address?.country || '',
    });
  }, [checkoutData.data?.savedOrder]);

  if (!cart.ready) return <SiteLayout><main className="catalogue-page page-gutter"><div className="request-state" role="status">Loading checkout…</div></main></SiteLayout>;
  if (cart.items.length === 0 && !retryOrderId && !mockPaymentOrder) return <Navigate to="/cart" replace />;
  if (checkoutData.loading || checkoutData.error) return <SiteLayout><main className="account-page page-gutter"><Link className="back-link" to="/cart">← Back to cart</Link><RequestState loading={checkoutData.loading} error={checkoutData.error} onRetry={checkoutData.retry} /></main></SiteLayout>;

  const { profile, pricedItems, savedOrder } = checkoutData.data;
  const unavailable = pricedItems.some((item) => !item.pricing);
  const cannotPay = unavailable && !savedOrder;
  const currency = savedOrder?.currency || pricedItems.find((item) => item.pricing)?.pricing.currency || 'INR';

  async function submit(event) {
    event.preventDefault(); setFormError('');
    if (cannotPay) return setFormError('Remove unavailable products from your cart before placing the order.');
    setPlacing(true);
    let applicationOrderId = savedApplicationOrderId;
    let activePaymentOrder = null;
    try {
      if (!applicationOrderId) {
        const refreshed = await repriceCart(cart.items);
        if (refreshed.some((item) => !item.pricing)) throw new Error('A cart item is no longer available. Return to your cart and review it.');
        const created = await accountRequest('/orders', {
          method: 'POST',
          body: {
            idempotencyKey: keyRef.current.key,
            items: cart.items.map(({ productId, quantity, selectedOptions, customInputs, designId }) => ({ productId, quantity, selectedOptions, customInputs, designId })),
            deliveryAddress: address,
            contact,
          },
        });
        applicationOrderId = created.order.id;
        try { sessionStorage.setItem(savedOrderKey, applicationOrderId); } catch { /* The server order idempotency key still protects repeats. */ }
      }

      const paymentOrder = await accountRequest('/payments/create-order', {
        method: 'POST', body: { orderId: applicationOrderId },
      });
      activePaymentOrder = paymentOrder;
      if (paymentOrder.mode === 'mock') {
        setMockPaymentOrder(paymentOrder);
        setMockPaymentResult(null);
        setPlacing(false);
        return;
      }
      if (paymentOrder.mode !== 'razorpay' || !paymentOrder.keyId?.startsWith('rzp_test_')) {
        throw new Error('The server returned an unsupported payment mode.');
      }
      await loadRazorpayCheckout();

      const recordFailure = async (reason) => {
        try {
          await accountRequest('/payments/failure', {
            method: 'POST', body: { orderId: applicationOrderId, paymentOrderId: paymentOrder.paymentOrderId, reason },
          });
        } catch { /* The order remains pending if the browser cannot reach the API. */ }
      };
      const checkout = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: 'Digital Heroes',
        description: `Order ${paymentOrder.orderReference}`,
        order_id: paymentOrder.gatewayOrderId,
        prefill: { name: contact.fullName, email: profile.email || '', contact: contact.phone || '' },
        notes: { application_order_id: paymentOrder.orderId },
        theme: { color: '#20231f' },
        handler: async (paymentResponse) => {
          setPlacing(true); setFormError('');
          try {
            const verified = await accountRequest('/payments/verify', {
              method: 'POST', body: {
                orderId: applicationOrderId,
                paymentOrderId: paymentOrder.paymentOrderId,
                ...paymentResponse,
              },
            });
            if (verified.paymentStatus !== 'paid') throw new Error('Payment verification did not confirm a successful payment.');
            let paidCartMatchesOrder = false;
            try {
              paidCartMatchesOrder = sessionStorage.getItem(savedOrderKey) === applicationOrderId;
              if (paidCartMatchesOrder) {
                sessionStorage.removeItem(keyRef.current.storageKey);
                sessionStorage.removeItem(savedOrderKey);
              }
            } catch { /* Storage may be unavailable. */ }
            if (paidCartMatchesOrder) cart.clearCart();
            navigate(`/account/orders/${applicationOrderId}?paid=1`, { replace: true });
          } catch (error) {
            setFormError(error.message || 'Payment could not be verified. You can retry from this checkout.');
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: async () => {
            await recordFailure('checkout_dismissed');
            setFormError('Checkout was closed. Your order is saved and you can retry payment.');
            setPlacing(false);
          },
        },
      });
      checkout.on('payment.failed', async () => {
        await recordFailure('payment_failed');
        setFormError('Payment was not completed. Your order is saved and you can retry payment.');
        setPlacing(false);
      });
      checkout.open();
    } catch (error) {
      if (applicationOrderId && activePaymentOrder?.mode === 'razorpay') {
        try {
          await accountRequest('/payments/failure', {
            method: 'POST', body: { orderId: applicationOrderId, paymentOrderId: activePaymentOrder.paymentOrderId, reason: 'checkout_dismissed' },
          });
        } catch { /* The order remains pending if payment setup did not reach the API. */ }
      }
      setFormError(error.message || 'We could not start the payment. Please try again.');
      setPlacing(false);
    }
  }

  async function simulateMockPayment(outcome) {
    if (!mockPaymentOrder) return;
    setSimulatingPayment(true); setFormError('');
    try {
      const simulation = await accountRequest('/payments/mock/simulate', {
        method: 'POST', body: {
          orderId: mockPaymentOrder.orderId,
          paymentOrderId: mockPaymentOrder.paymentOrderId,
          outcome,
        },
      });
      const status = await accountRequest(`/payments/${encodeURIComponent(mockPaymentOrder.orderId)}/status`);
      setMockPaymentResult({ simulation, status });
      if (status.paymentStatus === 'paid') {
        let paidCartMatchesOrder = false;
        try {
          paidCartMatchesOrder = sessionStorage.getItem(savedOrderKey) === mockPaymentOrder.orderId;
          if (paidCartMatchesOrder) {
            sessionStorage.removeItem(keyRef.current.storageKey);
            sessionStorage.removeItem(savedOrderKey);
          }
        } catch { /* Storage may be unavailable. */ }
        if (paidCartMatchesOrder) cart.clearCart();
      }
    } catch (error) {
      setFormError(error.message || 'The local payment simulation failed.');
    } finally { setSimulatingPayment(false); }
  }

  return <SiteLayout><main className="account-page page-gutter checkout-page">
    <Link className="back-link" to={retryOrderId ? `/account/orders/${encodeURIComponent(retryOrderId)}` : '/cart'}>{retryOrderId ? '← Back to order' : '← Back to cart'}</Link><p className="eyebrow">REVIEW & PLACE ORDER</p><h1>{retryOrderId ? 'Retry payment' : 'Checkout'}</h1>
    <p className="payment-notice">Checkout uses the configured payment mode. Local mock payments simulate status only and do not move money.</p>
    <form onSubmit={submit} className="checkout-layout">
      <div className="checkout-fields">
        <section className="checkout-section"><h2>Contact information</h2>
          <label>Full name<input value={contact.fullName} onChange={(event) => setContact((current) => ({ ...current, fullName: event.target.value }))} required maxLength="120" /></label>
          <label>Email<input value={profile.email || ''} readOnly /><small>Email comes from your verified account.</small></label>
          <label>Phone number <span className="optional-label">Optional</span><input type="tel" value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} maxLength="30" /></label>
        </section>
        <section className="checkout-section"><h2>Delivery address</h2>
          <label>Address line 1<input value={address.addressLine1} onChange={(event) => setAddress((current) => ({ ...current, addressLine1: event.target.value }))} required maxLength="200" autoComplete="address-line1" /></label>
          <label>Address line 2 <span className="optional-label">Optional</span><input value={address.addressLine2} onChange={(event) => setAddress((current) => ({ ...current, addressLine2: event.target.value }))} maxLength="200" autoComplete="address-line2" /></label>
          <div className="address-row"><label>City<input value={address.city} onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))} required maxLength="100" autoComplete="address-level2" /></label><label>State<input value={address.state} onChange={(event) => setAddress((current) => ({ ...current, state: event.target.value }))} required maxLength="100" autoComplete="address-level1" /></label></div>
          <div className="address-row"><label>Postal code<input value={address.postalCode} onChange={(event) => setAddress((current) => ({ ...current, postalCode: event.target.value }))} required maxLength="20" autoComplete="postal-code" /></label><label>Country<input value={address.country} onChange={(event) => setAddress((current) => ({ ...current, country: event.target.value }))} required maxLength="80" autoComplete="country-name" /></label></div>
        </section>
        {formError && <p className="form-message error" role="alert">{formError}</p>}
        <button className="calculate-button" disabled={placing || cannotPay}>{placing ? 'Preparing secure checkout…' : 'Pay now'} <span>↗</span></button>
      </div>
      <aside className="checkout-summary"><p className="eyebrow">ORDER SUMMARY</p>
        {savedOrder ? savedOrder.order_items.map((item) => <article className="cart-line" key={item.id}><div className="cart-line-main"><div><h2>{item.product_name}</h2><span>Quantity {item.quantity}</span></div><div className="cart-line-price"><span>{formatCurrency(item.unit_price, currency)} / unit</span><strong>{formatCurrency(item.line_total, currency)}</strong></div></div></article>)
          : pricedItems.map((item) => <CartLine key={item.id} item={item} readOnly />)}
        {savedOrder ? <div className="cart-summary-total"><span>Order total</span><strong>{formatCurrency(savedOrder.total_amount, currency)}</strong></div>
          : <div className="cart-summary-total"><span>Subtotal</span><strong>{formatCurrency(cartSubtotal(pricedItems), currency)}</strong></div>}
        <p>{savedOrder ? 'This saved order keeps the price confirmed when it was placed.' : 'Final prices are recalculated again by the server when the order is submitted.'}</p>
      </aside>
    </form>
    {mockPaymentOrder && <div className="payment-sandbox-backdrop">
      <section className="payment-sandbox-panel" role="dialog" aria-modal="true" aria-labelledby="payment-sandbox-title">
        <p className="eyebrow">MOCK MODE · NO REAL MONEY</p>
        <h2 id="payment-sandbox-title">Local Payment Sandbox</h2>
        <dl>
          <div><dt>Order reference</dt><dd>{savedOrder?.order_number || mockPaymentOrder.orderReference || mockPaymentOrder.orderId}</dd></div>
          <div><dt>Payable amount</dt><dd>{formatCurrency(mockPaymentOrder.amount / 100, mockPaymentOrder.currency)}</dd></div>
          <div><dt>Payment mode</dt><dd>Mock Sandbox</dd></div>
        </dl>
        {mockPaymentResult ? <div className={`payment-sandbox-result ${mockPaymentResult.status.paymentStatus === 'paid' ? 'is-success' : 'is-failure'}`} role="status">
          <strong>{mockPaymentResult.status.paymentStatus === 'paid' ? 'Mock payment succeeded.' : 'Mock payment failed.'}</strong>
          <span>Order payment status: {mockPaymentResult.status.paymentStatus}</span>
          <span>Attempt status: {mockPaymentResult.status.latestAttempt?.status || mockPaymentResult.simulation.paymentStatus}</span>
        </div> : <p>This local simulation changes the application payment status only. It does not process a transaction.</p>}
        {formError && <p className="form-message error" role="alert">{formError}</p>}
        {!mockPaymentResult && <div className="payment-sandbox-actions">
          <button className="calculate-button" type="button" disabled={simulatingPayment} onClick={() => simulateMockPayment('success')}>{simulatingPayment ? 'Processing…' : 'Simulate Payment Success'} <span>↗</span></button>
          <button className="text-link" type="button" disabled={simulatingPayment} onClick={() => simulateMockPayment('failure')}>Simulate Payment Failure</button>
        </div>}
        {mockPaymentResult?.status.paymentStatus === 'failed' && <button className="calculate-button" type="button" onClick={() => { setMockPaymentOrder(null); setMockPaymentResult(null); }}>Close and retry payment <span>↗</span></button>}
        {mockPaymentResult?.status.paymentStatus === 'paid' && <Link className="calculate-button" to={`/account/orders/${encodeURIComponent(mockPaymentOrder.orderId)}`}>View order status <span>↗</span></Link>}
        {!mockPaymentResult && <button className="payment-sandbox-close" type="button" disabled={simulatingPayment} onClick={() => setMockPaymentOrder(null)}>Close sandbox</button>}
      </section>
    </div>}
  </main></SiteLayout>;
}
