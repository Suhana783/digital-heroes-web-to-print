import { Link, useParams } from 'react-router-dom';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { ProductCard } from '../../features/catalogue/ProductCard.jsx';
import { useResource } from '../../hooks/useResource.js';
import { apiRequest } from '../../services/api.js';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';

export default function DivisionProducts() {
  const { divisionSlug } = useParams();
  const { data, loading, error, retry } = useResource(
    (signal) => apiRequest(`/catalogue/divisions/${encodeURIComponent(divisionSlug)}/products`, { signal }),
    [divisionSlug],
  );

  return (
    <SiteLayout>
      <main className="catalogue-page page-gutter">
        <Link className="back-link" to="/">← All divisions</Link>
        <RequestState loading={loading} error={error} onRetry={retry}>
          {data && <>
            <div className="catalogue-heading"><p className="eyebrow">THE WORKSHOP / {data.division.slug}</p><h1>{data.division.name}</h1><p>{data.division.description}</p></div>
            <div className="catalogue-subheading"><h2>Available work</h2><span>{data.products.length} {data.products.length === 1 ? 'product' : 'products'}</span></div>
            <RequestState loading={false} empty={data.products.length === 0 && 'There are no active products in this division yet.'}>
              <div className="product-grid">{data.products.map((product) => <ProductCard key={product.id} product={product} divisionSlug={divisionSlug} />)}</div>
            </RequestState>
          </>}
        </RequestState>
      </main>
    </SiteLayout>
  );
}
