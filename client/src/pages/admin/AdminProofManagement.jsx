import { useEffect, useState } from 'react';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { accountRequest } from '../../services/accountApi.js';
import { Link } from 'react-router-dom';

export default function AdminProofManagement() {
  const [queue, setQueue] = useState({ loading: true, error: '', items: [] });
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState({ loading: false, error: '', data: null });
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  async function loadQueue() {
    setQueue({ loading: true, error: '', items: [] });
    try { const items = await accountRequest('/admin/proofs/queue'); setQueue({ loading: false, error: '', items }); }
    catch (failure) { setQueue({ loading: false, error: new Error(failure.message), items: [] }); }
  }

  async function loadDetail(id) {
    setSelectedId(id); setDetail({ loading: true, error: '', data: null }); setMessage(''); setError('');
    try {
      const data = await accountRequest(`/admin/proofs/items/${encodeURIComponent(id)}`);
      setDetail({ loading: false, error: '', data });
    } catch (failure) { setDetail({ loading: false, error: new Error(failure.message), data: null }); }
  }

  useEffect(() => { loadQueue(); }, []);

  async function loadOrders() {
    setOrdersLoading(true); setOrdersError('');
    try { setOrders(await accountRequest('/admin/production/orders')); }
    catch (failure) { setOrdersError(failure.message || 'Production orders could not be loaded.'); }
    finally { setOrdersLoading(false); }
  }
  useEffect(() => { loadOrders(); }, []);

  async function advance(order, stage) {
    setBusy(`stage-${order.id}`); setError(''); setMessage('');
    try {
      await accountRequest(`/admin/production/orders/${encodeURIComponent(order.id)}/stage`, { method: 'PUT', body: { stage } });
      await loadOrders(); setMessage(`${order.order_number} moved to ${stage}.`);
    } catch (failure) { setError(failure.message || 'Order stage could not be updated.'); }
    finally { setBusy(''); }
  }

  async function download(path) {
    setBusy(path); setError('');
    try { const link = await accountRequest(path); window.location.assign(link.url); }
    catch (failure) { setError(failure.message || 'The secure download link could not be created.'); }
    finally { setBusy(''); }
  }

  async function generatePrintFile() {
    if (!selectedId) return;
    setBusy('generate'); setError(''); setMessage('');
    try {
      await accountRequest(`/admin/proofs/items/${encodeURIComponent(selectedId)}/print-files`, { method: 'POST' });
      await Promise.all([loadDetail(selectedId), loadQueue()]);
      setMessage('Unvalidated production draft generated from the latest approved proof.');
    } catch (failure) { setError(failure.message || 'The PDF could not be generated.'); }
    finally { setBusy(''); }
  }

  async function validatePrint(printFileId) {
    setBusy(`validate-${printFileId}`); setError(''); setMessage('');
    try {
      await accountRequest(`/admin/proofs/print-files/${encodeURIComponent(printFileId)}/validate`, { method: 'POST' });
      await Promise.all([loadDetail(selectedId), loadOrders()]);
      setMessage('PDF structure validated against the current approved proof. The file is now available to admins.');
    } catch (failure) { setError(failure.message || 'The production PDF could not be validated.'); }
    finally { setBusy(''); }
  }

  async function sendProof(event) {
    event.preventDefault();
    if (!file || !selectedId) return setError('Choose a PDF proof first.');
    setBusy('proof'); setError(''); setMessage('');
    try {
      const body = new FormData(); body.append('file', file); body.append('adminNotes', notes);
      await accountRequest(`/admin/proofs/items/${encodeURIComponent(selectedId)}`, { method: 'POST', body });
      setFile(null); setNotes('');
      await Promise.all([loadDetail(selectedId), loadQueue()]);
      setMessage('Proof sent to the customer.');
    } catch (failure) { setError(failure.message || 'The proof could not be sent.'); }
    finally { setBusy(''); }
  }

  const current = detail.data;
  const stageNames = ['quote', 'order', 'artwork', 'proof', 'production', 'completed'];
  const products = [...new Set(orders.flatMap((order) => order.order_items.map((item) => item.product_type)))];
  const filteredOrders = orders.filter((order) => (stageFilter === 'all' || order.production_stage === stageFilter)
    && (statusFilter === 'all' || order.status === statusFilter)
    && (productFilter === 'all' || order.order_items.some((item) => item.product_type === productFilter))
    && `${order.order_number} ${order.customer?.full_name || ''} ${order.customer?.email || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <SiteLayout><main className="account-page page-gutter proof-admin-page">
    <p className="eyebrow">ADMIN / ORDER MANAGEMENT</p>
    <div className="admin-order-heading"><h1>Orders & proof review</h1><Link className="text-link" to="/admin/reports">View reports ↗</Link></div>
    <p className="proof-page-intro">Review artwork and configuration, upload proofs for customer approval, and generate production files only from the latest approved proof.</p>
    <section className="proof-subsection" aria-labelledby="production-dashboard-heading">
      <h2 id="production-dashboard-heading">Production pipeline</h2>
      <div className="proof-spec-list">{stageNames.map((stage) => <span key={stage}><strong>{orders.filter((order) => order.production_stage === stage).length}</strong> {stage}</span>)}</div>
      <div className="admin-production-filters">
        <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number or customer" /></label>
        <label>Stage<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option>{stageNames.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
        <label>Product type<select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">All types</option>{products.map((product) => <option key={product}>{product}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{[...new Set(orders.map((order) => order.status))].map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
      {ordersError && <p className="form-message error" role="alert">{ordersError}</p>}
      {ordersLoading && <div className="request-state" role="status">Loading production orders…</div>}
      {!ordersLoading && !ordersError && filteredOrders.map((order) => <article className="proof-file-row" key={order.id}>
        <span><strong>{order.order_number} · {order.customer?.full_name || order.customer?.email || 'Customer'}</strong><small>{order.status} · {order.production_stage} · {order.order_items.length} item(s)</small>
          <small>{order.contact_snapshot?.email || order.customer?.email || 'No customer email'}{order.contact_snapshot?.phone ? ` · ${order.contact_snapshot.phone}` : ''}</small>
          {order.order_items.map((item) => <small key={item.id}>{item.product_type} / {item.product_name} · {item.quantity}{item.customer_design ? ` · Design: ${item.customer_design.name}` : ''} · {item.ready_for_production ? `Ready for production (proof v${item.latest_proof.version_number})` : item.production_block_reason === 'payment' ? `Proof v${item.latest_proof.version_number} approved · awaiting payment` : item.production_block_reason === 'print_file' ? `Proof v${item.latest_proof.version_number} approved · awaiting validated production file` : 'Awaiting latest proof approval'} <button className="text-link" type="button" onClick={() => loadDetail(item.id)}>Artwork, configuration & proofs ↗</button>{item.print_files.map((print) => <button className="text-link" type="button" key={print.id} onClick={() => download(`/admin/proofs/print-files/${print.id}/download`)}>Download production file ↗</button>)}</small>)}
        </span>
        <span><small>Delivery: {[order.delivery_address?.address_line_1, order.delivery_address?.city, order.delivery_address?.state, order.delivery_address?.postal_code, order.delivery_address?.country].filter(Boolean).join(', ') || '—'}</small><small>Stored order total: {order.currency} {order.total_amount} · Payment {order.payment_status}</small>
          <select aria-label={`Move ${order.order_number} to stage`} value={order.production_stage} disabled={busy === `stage-${order.id}` || order.status === 'cancelled'} onChange={(event) => advance(order, event.target.value)}>
            {stageNames.map((stage) => <option key={stage} value={stage} disabled={stage !== order.production_stage && !isAllowedTransition(order.production_stage, stage)}>{stage}</option>)}
          </select>
        </span>
      </article>)}
      {!ordersLoading && !ordersError && filteredOrders.length === 0 && <p className="account-empty">No orders match these filters.</p>}
    </section>
    <div className="proof-admin-layout">
      <section className="proof-queue" aria-labelledby="proof-queue-heading">
        <h2 id="proof-queue-heading">Needs action <span>{queue.items.length}</span></h2>
        <RequestState loading={queue.loading} error={queue.error} onRetry={loadQueue}>
          {queue.items.length === 0 && <p className="account-empty">No order items are waiting for a proof, revision, or production file.</p>}
          {queue.items.map((row) => <button className={`proof-queue-item${selectedId === row.item.id ? ' is-selected' : ''}`} key={row.item.id} type="button" onClick={() => loadDetail(row.item.id)}>
            <span className="state-kicker">{row.orderNumber} · {row.latestProof?.status === 'approved' ? `VERSION ${row.latestProof.version_number} APPROVED · FILE NEEDED` : row.latestProof ? `VERSION ${row.latestProof.version_number} REVISION` : 'NEW PROOF'}</span>
            <strong>{row.item.product_name}</strong>
            <small>{row.item.quantity} units · {row.artworkCount} artwork file{row.artworkCount === 1 ? '' : 's'}</small>
          </button>)}
        </RequestState>
      </section>

      <section className="proof-review-panel" aria-label="Selected order item">
        {!selectedId && <div className="request-state">Select an order item to review its artwork and proof versions.</div>}
        <RequestState loading={detail.loading} error={detail.error} onRetry={() => selectedId && loadDetail(selectedId)}>
          {current && <>
            <p className="state-kicker">{current.order.order_number} · {current.order.customer_id}</p>
            <h2>{current.item.product_name}</h2>
            <p className="proof-subtitle">{current.item.quantity} units</p>
            {current.item.customer_design && <p className="account-note">Saved design: <strong>{current.item.customer_design.name}</strong>{current.item.customer_design.product_templates?.name ? ` · ${current.item.customer_design.product_templates.name}` : ''} · {current.item.customer_design.id}</p>}
            {current.item.selected_options?.length > 0 && <ul className="proof-spec-list">{current.item.selected_options.map((option, index) => <li key={`${option.option_group_id}-${index}`}>{option.option_group_name}: {option.label ?? option.value}</li>)}</ul>}
            <p className="account-note">{current.specifications.dimensionsNote}</p>

            <section className="proof-subsection"><h3>Customer artwork</h3>
              {current.artwork.length === 0 ? <p className="account-empty">No artwork is attached to this item or order.</p> : current.artwork.map((art) => <div className="proof-file-row" key={art.id}>
                <span><strong>{art.original_filename}</strong><small>{art.mime_type} · {art.order_item_id ? 'Item artwork' : 'Order artwork'}</small></span>
                <button className="text-link" type="button" disabled={busy === `/admin/proofs/artwork/${art.id}/download`} onClick={() => download(`/admin/proofs/artwork/${art.id}/download`)}>{busy === `/admin/proofs/artwork/${art.id}/download` ? 'Preparing…' : 'Download'}</button>
              </div>)}
            </section>

            {current.printFiles.length > 0 && <section className="proof-subsection"><h3>Generated print files</h3>
              {current.printFiles.map((print) => <div className="proof-file-row" key={print.id}><span><strong>{print.original_filename}</strong><small>{print.generation_status === 'production_ready' ? 'Eligible via its associated latest approved proof' : print.generation_status === 'superseded' ? 'Superseded; no longer eligible for production' : 'Draft; not eligible for production'}</small></span>{print.generation_status === 'draft_unvalidated' ? <button className="text-link" type="button" disabled={busy === `validate-${print.id}`} onClick={() => validatePrint(print.id)}>{busy === `validate-${print.id}` ? 'Validating…' : 'Validate PDF'}</button> : <button className="text-link" type="button" disabled={print.generation_status !== 'production_ready'} onClick={() => download(`/admin/proofs/print-files/${print.id}/download`)}>{print.generation_status === 'production_ready' ? 'Download' : 'Unavailable'}</button>}</div>)}
            </section>}

            <section className="proof-subsection"><h3>Version history</h3>
              {current.proofs.length === 0 ? <p className="proof-subtitle">No proof versions yet.</p> : current.proofs.map((proof) => <div className="proof-history-row" key={proof.id}>
                <div><strong>Version {proof.version_number}</strong><span className={`proof-status status-${proof.status}`}>{proof.status.replaceAll('_', ' ')}</span><small>{new Date(proof.created_at).toLocaleString()}</small>{proof.customer_feedback && <em>Customer: {proof.customer_feedback}</em>}</div>
                <button className="text-link" type="button" onClick={() => download(`/admin/proofs/proofs/${proof.id}/download`)}>Download PDF</button>
              </div>)}
            </section>

            {current.proofs.at(-1)?.status === 'approved' && <section className="proof-subsection"><h3>Production output</h3><p className="account-note">Generated files remain unavailable for download until PDF structure validation succeeds against this approved proof.</p><button className="calculate-button" type="button" disabled={busy === 'generate' || current.printFiles.some((print) => print.approved_proof_id === current.proofs.at(-1).id && print.generation_status !== 'superseded')} onClick={generatePrintFile}>{busy === 'generate' ? 'Generating PDF…' : current.printFiles.some((print) => print.approved_proof_id === current.proofs.at(-1).id && print.generation_status !== 'superseded') ? 'Production draft already generated' : 'Generate production PDF'} <span>↗</span></button></section>}

            <form className="proof-upload-form" onSubmit={sendProof}>
              <h3>{current.proofs.at(-1)?.status === 'changes_requested' ? 'Create the next proof version' : 'Send a proof'}</h3>
              <label>Proof PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
              <label>Note for the customer<textarea rows="3" maxLength="4000" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <button className="calculate-button" disabled={busy === 'proof' || !file}>{busy === 'proof' ? 'Sending proof…' : 'Send proof to customer'} <span>↗</span></button>
            </form>
          </>}
        </RequestState>
        {error && <p className="form-message error" role="alert">{error}</p>}
        {message && <p className="form-message success" role="status">{message}</p>}
      </section>
    </div>
  </main></SiteLayout>;
}

function isAllowedTransition(current, next) {
  return ({ quote: ['order'], order: ['artwork'], artwork: ['proof'], proof: ['production'], production: ['completed'], completed: [] })[current]?.includes(next) || false;
}
