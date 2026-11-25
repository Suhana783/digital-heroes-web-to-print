import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { setProducts(await accountRequest('/admin/templates/products')); }
    catch (failure) { setError(failure.message || 'Products could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggle(product) {
    setBusyId(product.id); setError(''); setMessage('');
    try {
      await accountRequest(`/admin/products/${encodeURIComponent(product.id)}/status`, { method: 'PATCH', body: { is_active: !product.is_active } });
      setMessage(`${product.name} ${product.is_active ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (failure) { setError(failure.message || 'Product status could not be changed.'); }
    finally { setBusyId(''); }
  }

  const filtered = useMemo(() => products.filter((product) => (filter === 'all' || (filter === 'active') === product.is_active)
    && `${product.name} ${product.product_divisions?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [products, filter, search]);

  return <SiteLayout><main className="account-page page-gutter admin-products-page">
    <p className="eyebrow">ADMIN / CATALOGUE</p><div className="admin-product-heading"><div><h1>Products</h1><p>Review catalogue entries and control whether they are available to customers.</p></div><Link className="text-link" to="/admin/templates">Manage templates ↗</Link></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message success" role="status">{message}</p>}
    <div className="admin-product-filters"><label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product or division" /></label><label>Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
    {loading ? <div className="request-state" role="status">Loading catalogue products…</div> : !error && filtered.length === 0 ? <p className="account-empty">No products match this search.</p> : !error && <div className="admin-product-list">{filtered.map((product) => <article key={product.id} className="admin-product-row">
      <div><span className="state-kicker">{product.product_divisions?.name || 'Division'} / {product.is_active ? 'ACTIVE' : 'INACTIVE'}</span><strong>{product.name}</strong><small>{product.slug} · {product.is_active ? 'Shown in the customer catalogue' : 'Hidden from the customer catalogue'}</small></div>
      <button className="text-link" type="button" disabled={busyId === product.id} onClick={() => toggle(product)}>{busyId === product.id ? 'Saving…' : product.is_active ? 'Deactivate' : 'Activate'}</button>
    </article>)}</div>}
  </main></SiteLayout>;
}
