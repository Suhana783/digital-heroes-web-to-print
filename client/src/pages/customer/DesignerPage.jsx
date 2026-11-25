import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';
import { apiRequest } from '../../services/api.js';

const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana'];

function fitElement(element, area) {
  let width = Math.max(1, Math.min(Number(element.width), area.width));
  let height = Math.max(1, Math.min(Number(element.height), area.height));
  const radians = Math.abs(Number(element.rotation || 0)) * Math.PI / 180;
  const extentX = (w, h) => (Math.abs(Math.cos(radians)) * w + Math.abs(Math.sin(radians)) * h) / 2;
  const extentY = (w, h) => (Math.abs(Math.sin(radians)) * w + Math.abs(Math.cos(radians)) * h) / 2;
  const scale = Math.min(1, area.width / (2 * extentX(width, height)), area.height / (2 * extentY(width, height)));
  width *= scale; height *= scale;
  const ex = extentX(width, height); const ey = extentY(width, height);
  const centerX = Math.min(area.x + area.width - ex, Math.max(area.x + ex, Number(element.x) + Number(element.width) / 2));
  const centerY = Math.min(area.y + area.height - ey, Math.max(area.y + ey, Number(element.y) + Number(element.height) / 2));
  return { ...element, x: centerX - width / 2, y: centerY - height / 2, width, height };
}

export default function DesignerPage() {
  const { designId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(searchParams.get('productId') || '');
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [design, setDesign] = useState(null);
  const [elements, setElements] = useState([]);
  const [assets, setAssets] = useState([]);
  const [designName, setDesignName] = useState('Untitled design');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDesign, setLoadingDesign] = useState(Boolean(designId));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (designId) return undefined;
    let alive = true;
    apiRequest('/designer/products').then((rows) => {
      if (!alive) return;
      setProducts(rows);
      setProductId((current) => current || rows[0]?.id || '');
    }).catch((failure) => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, [designId]);

  useEffect(() => {
    if (designId || !productId) { setTemplates([]); return undefined; }
    let alive = true;
    setTemplatesLoading(true); setError('');
    apiRequest(`/designer/templates?productId=${encodeURIComponent(productId)}`)
      .then((rows) => { if (alive) setTemplates(rows); })
      .catch((failure) => { if (alive) setError(failure.message); })
      .finally(() => { if (alive) setTemplatesLoading(false); });
    return () => { alive = false; };
  }, [designId, productId]);

  useEffect(() => {
    if (!designId) return undefined;
    let alive = true;
    setLoadingDesign(true); setError('');
    accountRequest(`/designer/designs/${encodeURIComponent(designId)}`).then((record) => {
      if (!alive) return;
      setDesign(record); setElements(record.design_data.elements); setAssets(record.assets);
      setDesignName(record.name); setSelectedId('');
    }).catch((failure) => { if (alive) setError(failure.message || 'Saved design could not be opened.'); })
      .finally(() => { if (alive) setLoadingDesign(false); });
    return () => { alive = false; };
  }, [designId]);

  const template = design?.design_data.template;
  const area = template?.printableArea;
  const selected = useMemo(() => elements.find((element) => element.id === selectedId) || null, [elements, selectedId]);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  async function startDesign(templateId) {
    setBusy(true); setError('');
    try {
      const created = await accountRequest('/designer/designs', { method: 'POST', body: { templateId } });
      navigate(`/account/designer/${created.id}`);
    } catch (failure) { setError(failure.message || 'Design could not be started.'); }
    finally { setBusy(false); }
  }

  function addText() {
    if (!template?.allowedElements.includes('text')) return;
    const box = template.printableArea;
    const item = fitElement({
      id: crypto.randomUUID(), type: 'text', text: 'Your text',
      fontFamily: 'Arial', fontSize: Math.max(8, box.height * 0.12), color: '#20231f', rotation: 0,
      x: box.x + box.width * 0.1, y: box.y + box.height * 0.1,
      width: box.width * 0.8, height: box.height * 0.25,
    }, box);
    setElements((current) => [...current, item]); setSelectedId(item.id); setMessage('');
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !design) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData(); body.append('file', file);
      const asset = await accountRequest(`/designer/designs/${encodeURIComponent(design.id)}/assets`, { method: 'POST', body });
      setAssets((current) => [...current, asset]);
      if (asset.is_previewable && template.allowedElements.includes('image')) {
        const box = template.printableArea;
        const item = fitElement({
          id: crypto.randomUUID(), type: 'image', assetId: asset.id, rotation: 0,
          x: box.x + box.width * 0.25, y: box.y + box.height * 0.25,
          width: box.width * 0.5, height: box.height * 0.5,
        }, box);
        setElements((current) => [...current, item]); setSelectedId(item.id);
      } else {
        setMessage(`${asset.original_filename} is saved as an original file; it cannot be edited on this canvas.`);
      }
    } catch (failure) { setError(failure.message || 'The design file could not be uploaded.'); }
    finally { setBusy(false); }
  }

  async function downloadAsset(asset) {
    try {
      const link = await accountRequest(`/designer/designs/${encodeURIComponent(design.id)}/assets/${encodeURIComponent(asset.id)}/download`);
      window.location.assign(link.url);
    } catch (failure) { setError(failure.message || 'The original file could not be downloaded.'); }
  }

  async function saveDesign() {
    if (!design) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await accountRequest(`/designer/designs/${encodeURIComponent(design.id)}`, {
        method: 'PUT', body: { name: designName, elements },
      });
      setDesign(saved); setElements(saved.design_data.elements); setAssets(saved.assets);
      setMessage('Design saved to your account.');
    } catch (failure) { setError(failure.message || 'Design could not be saved.'); }
    finally { setBusy(false); }
  }

  function changeSelected(key, value) {
    if (!selected || !area) return;
    const next = { ...selected, [key]: ['x', 'y', 'width', 'height', 'fontSize', 'rotation'].includes(key) ? Number(value) : value };
    const fitted = fitElement(next, area);
    setElements((current) => current.map((element) => element.id === selected.id ? fitted : element));
  }

  function removeSelected() {
    if (!selected) return;
    setElements((current) => current.filter((element) => element.id !== selected.id)); setSelectedId('');
  }

  function pointInCanvas(event) {
    const svg = svgRef.current;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  function startDrag(event, element) {
    event.preventDefault(); event.stopPropagation();
    const point = pointInCanvas(event);
    setSelectedId(element.id);
    dragRef.current = { id: element.id, pointerId: event.pointerId, x: point.x, y: point.y, startX: element.x, startY: element.y };
    svgRef.current.setPointerCapture(event.pointerId);
  }

  function movePointer(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !area) return;
    const point = pointInCanvas(event);
    setElements((current) => current.map((element) => element.id === drag.id
      ? fitElement({ ...element, x: drag.startX + point.x - drag.x, y: drag.startY + point.y - drag.y }, area)
      : element));
  }

  function stopDrag(event) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  if (designId) {
    return <SiteLayout><main className="account-page page-gutter designer-page">
      <Link className="back-link" to="/account/designs">← Saved designs</Link>
      <RequestState loading={loadingDesign} error={error && !design ? new Error(error) : null} onRetry={() => navigate(0)}>
        {design && template && area && <>
          <p className="eyebrow">BROWSER DESIGNER / {design.product?.name || 'PRODUCT'}</p>
          <div className="designer-heading"><div><h1>{designName}</h1><p>{design.template?.name || template.name} · Canvas coordinate units</p></div><button className="calculate-button" type="button" onClick={saveDesign} disabled={busy}>{busy ? 'Saving…' : 'Save design'} <span>↗</span></button></div>
          <div className="designer-layout">
            <aside className="designer-tools">
              <label>Design name<input value={designName} maxLength="120" onChange={(event) => setDesignName(event.target.value)} /></label>
              {template.allowedElements.includes('text') && <button className="add-cart-button" type="button" onClick={addText}>Add text <span>＋</span></button>}
              {template.allowedElements.includes('text') && <p className="designer-upload-note">For CSV personalization, save text tokens such as {'{{name}}'} in a text element, then map them on the CSV merge page.</p>}
              {template.allowedElements.includes('image') && <button className="add-cart-button" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>Upload PNG or JPG <span>＋</span></button>}
              <input ref={fileRef} className="visually-hidden" type="file" accept=".png,.jpg,.jpeg,.pdf,.svg,.ai,image/png,image/jpeg,application/pdf,image/svg+xml,application/postscript" onChange={uploadFile} />
              <p className="designer-upload-note">PNG/JPG can be placed on the canvas. PDF, SVG and AI originals are stored for reference; they are not editable in this designer.</p>
              {selected && <section className="designer-properties"><div className="catalogue-subheading"><h2>Selected {selected.type}</h2><button className="text-link" type="button" onClick={removeSelected}>Remove</button></div>
                {selected.type === 'text' && <>
                  <label>Text<textarea rows="3" maxLength="3000" value={selected.text} onChange={(event) => changeSelected('text', event.target.value)} /></label>
                  <label>Font<select value={selected.fontFamily} onChange={(event) => changeSelected('fontFamily', event.target.value)}>{FONTS.map((font) => <option key={font}>{font}</option>)}</select></label>
                  <div className="designer-field-grid"><label>Font size<input type="number" min="1" max="1000" value={selected.fontSize} onChange={(event) => changeSelected('fontSize', event.target.value)} /></label><label>Color<input type="color" value={selected.color} onChange={(event) => changeSelected('color', event.target.value)} /></label></div>
                </>}
                <div className="designer-field-grid"><label>X<input type="number" step="any" value={Number(selected.x.toFixed(2))} onChange={(event) => changeSelected('x', event.target.value)} /></label><label>Y<input type="number" step="any" value={Number(selected.y.toFixed(2))} onChange={(event) => changeSelected('y', event.target.value)} /></label><label>Width<input type="number" min="1" step="any" value={Number(selected.width.toFixed(2))} onChange={(event) => changeSelected('width', event.target.value)} /></label><label>Height<input type="number" min="1" step="any" value={Number(selected.height.toFixed(2))} onChange={(event) => changeSelected('height', event.target.value)} /></label><label>Rotation<input type="number" min="-360" max="360" value={selected.rotation} onChange={(event) => changeSelected('rotation', event.target.value)} /></label></div>
              </section>}
              {assets.length > 0 && <section className="designer-assets"><h2>Uploaded originals</h2>{assets.map((asset) => <div key={asset.id}><span><strong>{asset.original_filename}</strong><small>{asset.is_previewable ? 'PNG/JPG · editable' : `${asset.mime_type} · original only`}</small></span><button className="text-link" type="button" onClick={() => downloadAsset(asset)}>Download</button></div>)}</section>}
            </aside>
            <section className="designer-canvas-panel"><div className="designer-canvas-heading"><strong>Printable area</strong><span>Elements stay inside the dashed boundary.</span></div>
              <svg ref={svgRef} className="designer-canvas" viewBox={`0 0 ${template.canvas.width} ${template.canvas.height}`} style={{ background: template.backgroundColor, aspectRatio: `${template.canvas.width} / ${template.canvas.height}` }} onPointerMove={movePointer} onPointerUp={stopDrag} onPointerCancel={stopDrag} onPointerDown={() => setSelectedId('')} role="img" aria-label={`Design canvas for ${design.product?.name || 'product'}`}>
                <defs><clipPath id={`print-area-${design.id}`}><rect x={area.x} y={area.y} width={area.width} height={area.height} /></clipPath></defs>
                <g clipPath={`url(#print-area-${design.id})`}>
                  {elements.map((element) => {
                    const asset = element.type === 'image' ? assetById.get(element.assetId) : null;
                    const transform = `rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`;
                    return <g key={element.id} transform={transform} onPointerDown={(event) => startDrag(event, element)} onClick={(event) => { event.stopPropagation(); setSelectedId(element.id); }} style={{ cursor: 'move' }}>
                      {element.type === 'text' ? <foreignObject x={element.x} y={element.y} width={element.width} height={element.height}><div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: element.color, fontFamily: element.fontFamily, fontSize: element.fontSize, lineHeight: 1.05 }}>{element.text}</div></foreignObject> : asset?.preview_url ? <image x={element.x} y={element.y} width={element.width} height={element.height} href={asset.preview_url} preserveAspectRatio="xMidYMid meet" /> : <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="#cccccc" />}
                      {selectedId === element.id && <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="none" stroke="#e64d32" strokeWidth={Math.max(1, template.canvas.width / 600)} strokeDasharray="5 4" pointerEvents="none" />}
                    </g>;
                  })}
                </g>
                <rect x={area.x} y={area.y} width={area.width} height={area.height} fill="none" stroke="#e64d32" strokeWidth={Math.max(1, template.canvas.width / 500)} strokeDasharray="8 5" pointerEvents="none" />
              </svg>
              {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message success" role="status">{message}</p>}
            </section>
          </div>
        </>}
      </RequestState>
    </main></SiteLayout>;
  }

  return <SiteLayout><main className="account-page page-gutter designer-page">
    <Link className="back-link" to="/account/designs">← Saved designs</Link><p className="eyebrow">BROWSER DESIGNER</p><h1>Choose a template</h1>
    <p className="designer-upload-note">Templates use administrator-defined canvas units and printable boundaries. No physical dimensions are assumed.</p>
    <label className="designer-product-select">Product<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Choose a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.division?.name} · {product.name}</option>)}</select></label>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <RequestState loading={templatesLoading} error={null}>
      {productId && !templatesLoading && templates.length === 0 && <p className="account-empty">No active templates are available for this product yet.</p>}
      <div className="designer-template-grid">{templates.map((item) => <article className="designer-template-card" key={item.id}>
        <div className="designer-template-preview" style={{ background: item.background_color, aspectRatio: `${item.canvas_width} / ${item.canvas_height}` }}><span style={{ left: `${Number(item.printable_x) / Number(item.canvas_width) * 100}%`, top: `${Number(item.printable_y) / Number(item.canvas_height) * 100}%`, width: `${Number(item.printable_width) / Number(item.canvas_width) * 100}%`, height: `${Number(item.printable_height) / Number(item.canvas_height) * 100}%` }} /></div>
        <h2>{item.name}</h2><p>{item.canvas_width} × {item.canvas_height} coordinate units</p><button className="calculate-button" type="button" disabled={busy} onClick={() => startDesign(item.id)}>{busy ? 'Starting…' : 'Start design'} <span>↗</span></button>
      </article>)}</div>
    </RequestState>
  </main></SiteLayout>;
}
