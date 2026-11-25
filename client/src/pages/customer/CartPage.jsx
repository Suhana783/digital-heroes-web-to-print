import { Link, Navigate } from 'react-router-dom';
import { CartLine } from '../../features/cart/CartLine.jsx';
import { cartSubtotal, formatCurrency, repriceCart } from '../../features/cart/cartUtils.js';
import { useCart } from '../../context/CartContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';

export default function CartPage() {
  const cart = useCart();
  const resource = useResource(() => repriceCart(cart.items), [cart.items]);
  const productKey = cart.items.map((item) => item.productId).sort().join('|');
  const designsResource = useResource(() => cart.ready && cart.items.length
    ? accountRequest('/designer/designs') : Promise.resolve([]), [cart.ready, productKey]);
  if (!cart.ready) return <SiteLayout><main className="catalogue-page page-gutter"><div className="request-state" role="status">Loading your cart…</div></main></SiteLayout>;

  const pricedItems = resource.data || [];
  const hasUnavailableItem = pricedItems.some((item) => !item.pricing);
  const currency = pricedItems.find((item) => item.pricing)?.pricing.currency || 'INR';

  return <SiteLayout><main className="account-page page-gutter cart-page">
    <p className="eyebrow">YOUR SELECTION</p><h1>Shopping cart</h1>
    {cart.items.length === 0 ? <div className="account-empty cart-empty"><p>Your cart is empty.</p><Link className="text-link" to="/">Explore products <span>↗</span></Link></div> : <>
      <RequestState loading={resource.loading} error={resource.error} onRetry={resource.retry}>
        {resource.data && <>
          <div className="cart-layout"><section className="cart-lines">{pricedItems.map((item) => {
            const designs = (designsResource.data || []).filter((design) => design.product_id === item.productId);
            const selectedDesignIsListed = designs.some((design) => design.id === item.designId);
            return <CartLine key={item.id} item={item} onQuantityChange={(quantity) => cart.updateQuantity(item.id, quantity)} onRemove={() => cart.removeItem(item.id)}
              designControl={<div className="cart-design-control"><label htmlFor={`cart-design-${item.id}`}>Saved design for this product</label><select id={`cart-design-${item.id}`} value={item.designId || ''} disabled={designsResource.loading} onChange={(event) => cart.updateDesign(item.id, designs.find((design) => design.id === event.target.value) || null)}>
                <option value="">No saved design</option>
                {item.designId && !selectedDesignIsListed && <option value={item.designId}>{item.designName || 'Previously selected design (unavailable)'}</option>}
                {designs.map((design) => <option key={design.id} value={design.id}>{design.name} · {design.template?.name || 'Template'}</option>)}
              </select>{designsResource.error && <small className="form-message error">Saved designs could not be loaded. You can continue without one or retry by refreshing.</small>}{!designsResource.loading && !designs.length && !designsResource.error && <small>No saved designs for this product. <Link to={`/account/designer?productId=${encodeURIComponent(item.productId)}`}>Create a design</Link></small>}</div>} />;
          })}</section>
            <aside className="cart-summary"><p className="eyebrow">ORDER SUMMARY</p><div><span>Items</span><span>{cart.itemCount}</span></div><div className="cart-summary-total"><span>Subtotal</span><strong>{formatCurrency(cartSubtotal(pricedItems), currency)}</strong></div><p>Prices were refreshed from the current catalogue. Delivery and payment are handled in later steps.</p>
              <Link className={`calculate-button cart-checkout-link ${hasUnavailableItem ? 'disabled-link' : ''}`} aria-disabled={hasUnavailableItem} to={hasUnavailableItem ? '#' : '/checkout'}>Proceed to checkout <span>↗</span></Link>
            </aside>
          </div>
          <div className="cart-footer-actions"><Link className="text-link" to="/">← Continue shopping</Link><button type="button" onClick={cart.clearCart}>Clear cart</button></div>
        </>}
      </RequestState>
    </>}
  </main></SiteLayout>;
}
