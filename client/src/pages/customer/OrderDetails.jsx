import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { useResource } from '../../hooks/useResource.js';
import { accountRequest } from '../../services/accountApi.js';
import { formatCurrency } from '../../features/cart/cartUtils.js';
import { OrderProofs } from '../../features/orders/OrderProofs.jsx';

export default function OrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [orderItemId, setOrderItemId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState('');
  const result = useResource(() => accountRequest(`/orders/${encodeURIComponent(orderId)}`), [orderId]);
  const artwork = useResource(() => accountRequest(`/orders/${encodeURIComponent(orderId)}/artwork`), [orderId]);

  async function upload(event) {
    event.preventDefault();
    if (!file) return setUploadError('Choose an artwork file first.');
    setUploading(true); setUploadError(''); setUploadMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (orderItemId) body.append('orderItemId', orderItemId);
      await accountRequest(`/orders/${encodeURIComponent(orderId)}/artwork`, { method: 'POST', body });
      setFile(null); setOrderItemId('');
      if (fileInput.current) fileInput.current.value = '';
      setUploadMessage('Artwork uploaded and attached to this order.');
      artwork.retry();
    } catch (error) {
      setUploadError(error.message || 'The artwork could not be uploaded.');
    } finally { setUploading(false); }
  }

  async function download(artworkId) {
    setDownloadingId(artworkId); setDownloadError('');
    try {
      const link = await accountRequest(`/artwork/${encodeURIComponent(artworkId)}/download`);
      window.location.assign(link.url);
    } catch (error) {
      setDownloadError(error.message || 'A secure download link could not be created.');
    } finally { setDownloadingId(''); }
  }

  async function reorder() {
    if (!order) return;
    setReordering(true); setReorderError('');
    try {
      const items = order.order_items.map((item) => {
        const optionGroups = new Map();
        const customInputs = [];
        for (const option of item.selected_options || []) {
          if (option.option_value_id) {
            const ids = optionGroups.get(option.option_group_id) || [];
            ids.push(option.option_value_id);
            optionGroups.set(option.option_group_id, ids);
          } else if (option.input_type) customInputs.push({ optionGroupId: option.option_group_id, value: option.value });
        }
        if (!item.product_id) throw new Error(`${item.product_name} is no longer linked to an active catalogue product.`);
        return {
          productId: item.product_id,
          quantity: item.quantity,
          designId: item.customer_design_id || null,
          selectedOptions: [...optionGroups].map(([optionGroupId, optionValueIds]) => ({ optionGroupId, optionValueIds })),
          customInputs,
        };
      });
      const address = order.delivery_address || {};
      const result = await accountRequest('/orders', { method: 'POST', body: {
        idempotencyKey: globalThis.crypto.randomUUID(),
        items,
        deliveryAddress: {
          addressLine1: address.address_line_1 || '', addressLine2: address.address_line_2 || '',
          city: address.city || '', state: address.state || '', postalCode: address.postal_code || '', country: address.country || '',
        },
        contact: { fullName: order.contact_snapshot?.full_name || '', phone: order.contact_snapshot?.phone || '' },
      } });
      navigate(`/account/orders/${result.order.id}?placed=1`);
    } catch (failure) { setReorderError(failure.message || 'This order could not be reordered with current catalogue pricing.'); }
    finally { setReordering(false); }
  }

  const order = result.data;

  return <SiteLayout><main className="account-page page-gutter order-detail-page">
    <Link className="back-link" to="/account/orders">← Order history</Link>
    <RequestState loading={result.loading} error={result.error} onRetry={result.retry}>
      {order && <>
        {searchParams.has('paid') && order.payment_status === 'paid' && <div className="order-success" role="status"><span className="state-kicker">PAYMENT VERIFIED</span><h1>Thank you.</h1><p>Your payment was verified and recorded for this order.</p></div>}
        {['failed', 'unpaid', 'pending'].includes(order.payment_status) && order.status !== 'cancelled' && <p className="payment-notice" role="status">{order.payment_status === 'failed' ? 'The last payment attempt was not completed.' : 'Payment has not been completed for this order.'} <Link className="text-link" to={`/checkout?orderId=${encodeURIComponent(order.id)}`}>Pay or retry payment ↗</Link></p>}
        <p className="eyebrow">ORDER / {order.status.toUpperCase()}</p><h1>{order.order_number}</h1>
        <p className="order-meta">Placed {new Date(order.created_at).toLocaleString()} · Stage {String(order.production_stage || 'order').replaceAll('_', ' ')} · Payment {order.payment_status}</p>
        <div className="order-customer-actions"><Link className="text-link" to={`/account/orders/${order.id}/receipt`}>View order receipt ↗</Link><button className="text-link" type="button" disabled={reordering} onClick={reorder}>{reordering ? 'Reordering…' : 'Reorder with current prices ↗'}</button></div>
        {reorderError && <p className="form-message error" role="alert">{reorderError}</p>}
        <div className="order-item-list">{order.order_items.map((item) => <article className="order-item" key={item.id}>
          <div><h2>{item.product_name}</h2><span>{item.quantity} × {formatCurrency(item.unit_price, result.data.currency)}</span></div>
          <strong>{formatCurrency(item.line_total, order.currency)}</strong>
          {item.customer_design && <p className="order-saved-design">Saved design: <Link to={`/account/designer/${encodeURIComponent(item.customer_design.id)}`}>{item.customer_design.name}</Link>{item.customer_design.product_templates?.name ? ` · ${item.customer_design.product_templates.name}` : ''}</p>}
          {Array.isArray(item.selected_options) && item.selected_options.length > 0 && <ul>{item.selected_options.map((option, index) => <li key={`${option.option_group_id}-${index}`}>{option.option_group_name}: {option.label ?? option.value}</li>)}</ul>}
        </article>)}</div>
        <div className="order-totals"><div><span>Subtotal</span><strong>{formatCurrency(order.subtotal, order.currency)}</strong></div><div><span>Total</span><strong>{formatCurrency(order.total_amount, order.currency)}</strong></div></div>
        <section className="artwork-section" aria-labelledby="artwork-heading">
          <div className="catalogue-subheading"><div><p className="eyebrow">ORDER FILES</p><h2 id="artwork-heading">Artwork</h2></div></div>
          <form className="artwork-upload-form" onSubmit={upload}>
            <label>Attach to item <span className="optional-label">Optional</span>
              <select value={orderItemId} onChange={(event) => setOrderItemId(event.target.value)} disabled={uploading}>
                <option value="">Whole order</option>
                {order.order_items.map((item) => <option key={item.id} value={item.id}>{item.product_name} · {item.quantity} units</option>)}
              </select>
            </label>
            <label>Artwork file<input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml" onChange={(event) => { setFile(event.target.files?.[0] || null); setUploadError(''); setUploadMessage(''); }} disabled={uploading} /></label>
            <p className="artwork-help">PDF, PNG, JPG, JPEG, or SVG · maximum 10 MB. SVG files are kept as downloads and are not previewed here.</p>
            {uploadError && <p className="form-message error" role="alert">{uploadError}</p>}
            {uploadMessage && <p className="form-message success" role="status">{uploadMessage}</p>}
            <button className="calculate-button" type="submit" disabled={uploading || !file}>{uploading ? 'Uploading artwork…' : 'Upload artwork'} <span>↗</span></button>
          </form>
          <div className="artwork-list" aria-live="polite">
            <RequestState loading={artwork.loading} error={artwork.error} onRetry={artwork.retry}>
              {artwork.data?.length === 0 && <p className="account-empty">No artwork uploaded for this order yet.</p>}
              {artwork.data?.map((file) => <article className="artwork-file" key={file.id}>
                <div><strong>{file.original_filename}</strong><span>{file.mime_type} · {formatFileSize(file.file_size)} · {new Date(file.created_at).toLocaleDateString()}</span><span>Status: {file.upload_status}{file.order_item_id ? ` · ${order.order_items.find((item) => item.id === file.order_item_id)?.product_name || 'Order item'}` : ' · Whole order'}</span></div>
                <button className="text-link" type="button" disabled={downloadingId === file.id} onClick={() => download(file.id)}>{downloadingId === file.id ? 'Preparing…' : 'Download ↗'}</button>
              </article>)}
            </RequestState>
          </div>
          {downloadError && <p className="form-message error" role="alert">{downloadError}</p>}
        </section>
        <OrderProofs orderId={order.id} orderItems={order.order_items} />
        <div className="order-detail-links"><Link className="text-link" to="/">Continue browsing <span>↗</span></Link><Link className="text-link" to="/account/orders">All orders <span>↗</span></Link></div>
      </>}
    </RequestState>
  </main></SiteLayout>;
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
