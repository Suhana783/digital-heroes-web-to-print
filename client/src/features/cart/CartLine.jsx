import { Link } from 'react-router-dom';
import { formatCurrency, selectedConfiguration } from './cartUtils.js';

export function CartLine({ item, onQuantityChange, onRemove, readOnly = false, designControl = null }) {
  const configuration = item.pricing ? selectedConfiguration(item.pricing) : [];
  return (
    <article className="cart-line">
      <div className="cart-line-main">
        <div><span className="state-kicker">{item.divisionSlug.replaceAll('-', ' ')}</span><h2>{item.pricing?.product.name || `${item.productSlug.replaceAll('-', ' ')}`}</h2></div>
        {item.pricing ? <>
          <ul className="cart-options">{configuration.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul>
          {readOnly && item.designName && <p className="cart-design-summary">Saved design: {item.designName}{item.designTemplateName ? ` · ${item.designTemplateName}` : ''}</p>}
          <div className="cart-quantity"><span>Quantity</span><div>{!readOnly && <button type="button" aria-label="Decrease quantity" disabled={item.quantity <= 1} onClick={() => onQuantityChange(item.quantity - 1)}>−</button>}<strong>{item.quantity}</strong>{!readOnly && <button type="button" aria-label="Increase quantity" onClick={() => onQuantityChange(item.quantity + 1)}>+</button>}</div></div>
          <div className="cart-line-price"><span>{formatCurrency(item.pricing.final_unit_price, item.pricing.currency)} / unit</span><strong>{formatCurrency(item.pricing.subtotal, item.pricing.currency)}</strong></div>
        </> : <p className="cart-unavailable" role="alert">{item.error?.message || 'This product is currently unavailable.'} Remove it to continue checkout.</p>}
        {!readOnly && <div className="cart-line-actions"><Link to={`/catalogue/${item.divisionSlug}/${item.productSlug}`}>Edit configuration</Link><button type="button" onClick={onRemove}>Remove</button></div>}
      </div>
      {designControl}
    </article>
  );
}
