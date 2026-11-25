import { Link } from 'react-router-dom';

export function ProductCard({ product, divisionSlug }) {
  return (
    <article className="product-card">
      <div className="product-placeholder" aria-hidden="true"><span>DH</span><i>MADE TO ORDER</i></div>
      <div className="product-card-copy">
        <span className="state-kicker">{product.pricing_model.replaceAll('_', ' ')}</span>
        <h2>{product.name}</h2>
        <p>{product.description || 'No product description is available.'}</p>
        <div className="product-card-bottom">
          <span>From <strong>{formatPrice(product.base_price)}</strong></span>
          <Link className="text-link" to={`/catalogue/${divisionSlug}/${product.slug}`}>View details <span>↗</span></Link>
        </div>
      </div>
    </article>
  );
}

export function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Price on request';
  return amount.toFixed(2);
}
