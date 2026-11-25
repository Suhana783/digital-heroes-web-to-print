import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';

export default function SavedDesigns() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { setDesigns(await accountRequest('/designer/designs')); }
    catch (failure) { setError(failure.message || 'Saved designs could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function remove(id) {
    if (!window.confirm('Delete this saved design and its uploaded files?')) return;
    setBusyId(id); setError('');
    try { await accountRequest(`/designer/designs/${encodeURIComponent(id)}`, { method: 'DELETE' }); setDesigns((rows) => rows.filter((row) => row.id !== id)); }
    catch (failure) { setError(failure.message || 'The design could not be deleted.'); }
    finally { setBusyId(''); }
  }

  return <SiteLayout><main className="account-page page-gutter saved-designs-page">
    <p className="eyebrow">CUSTOMER ACCOUNT / DESIGN LIBRARY</p><div className="saved-design-heading"><h1>Your saved designs</h1><Link className="calculate-button" to="/account/designer">Start a design <span>↗</span></Link></div>
    {error && <div className="request-state request-error" role="alert"><p>{error}</p><button className="button-link" type="button" onClick={load}>Try again ↻</button></div>}
    {loading ? <div className="request-state" role="status">Loading saved designs…</div> : designs.length === 0 ? <p className="account-empty">No saved designs yet. Choose a product template to start one.</p> : <div className="saved-design-list">
      {designs.map((design) => <article className="saved-design-card" key={design.id}>
        <div><span className="state-kicker">{design.product?.name || 'Product'} · {design.template?.name || 'Template'}</span><h2>{design.name}</h2><small>Updated {new Date(design.updated_at).toLocaleString()} · {design.design_data.elements.length} element{design.design_data.elements.length === 1 ? '' : 's'}</small></div>
        <div><Link className="text-link" to={`/account/designer/${design.id}`}>Continue editing ↗</Link><button className="button-link" type="button" disabled={busyId === design.id} onClick={() => remove(design.id)}>{busyId === design.id ? 'Deleting…' : 'Delete'}</button></div>
      </article>)}
    </div>}
  </main></SiteLayout>;
}
