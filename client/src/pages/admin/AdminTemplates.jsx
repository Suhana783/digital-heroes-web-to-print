import { useEffect, useState } from 'react';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';

const EMPTY_FORM = {
  product_id: '', name: '', canvas_width: '', canvas_height: '',
  printable_x: '0', printable_y: '0', printable_width: '', printable_height: '',
  background_color: '#ffffff', allowed_elements: ['text', 'image'],
  placeholder_config: '{"placeholders": []}', is_active: false,
};

export default function AdminTemplates() {
  const [products, setProducts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [productRows, templateRows] = await Promise.all([
        accountRequest('/admin/templates/products'), accountRequest('/admin/templates'),
      ]);
      setProducts(productRows); setTemplates(templateRows);
    } catch (failure) { setError(failure.message || 'Templates could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function setField(key, value) { setForm((previous) => ({ ...previous, [key]: value })); }

  function edit(template) {
    setEditingId(template.id); setMessage(''); setError('');
    setForm({
      product_id: template.product_id, name: template.name,
      canvas_width: String(template.canvas_width), canvas_height: String(template.canvas_height),
      printable_x: String(template.printable_x), printable_y: String(template.printable_y),
      printable_width: String(template.printable_width), printable_height: String(template.printable_height),
      background_color: template.background_color, allowed_elements: template.allowed_elements,
      placeholder_config: JSON.stringify(template.placeholder_config, null, 2), is_active: template.is_active,
    });
  }

  function reset() { setEditingId(''); setForm(EMPTY_FORM); setError(''); setMessage(''); }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    let placeholderConfig;
    try { placeholderConfig = JSON.parse(form.placeholder_config); }
    catch { setSaving(false); return setError('Placeholder configuration must be valid JSON.'); }
    const payload = {
      ...form,
      canvas_width: Number(form.canvas_width), canvas_height: Number(form.canvas_height),
      printable_x: Number(form.printable_x), printable_y: Number(form.printable_y),
      printable_width: Number(form.printable_width), printable_height: Number(form.printable_height),
      placeholder_config: placeholderConfig,
    };
    try {
      await accountRequest(editingId ? `/admin/templates/${encodeURIComponent(editingId)}` : '/admin/templates', {
        method: editingId ? 'PUT' : 'POST', body: payload,
      });
      await load(); reset(); setMessage(editingId ? 'Template saved.' : 'Template created.');
    } catch (failure) { setError(failure.message || 'Template could not be saved.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(template) {
    setError(''); setMessage('');
    try {
      await accountRequest(`/admin/templates/${encodeURIComponent(template.id)}`, {
        method: 'PUT', body: { ...template, is_active: !template.is_active },
      });
      await load(); setMessage(`Template ${template.is_active ? 'deactivated' : 'activated'}.`);
    } catch (failure) { setError(failure.message || 'Template status could not be changed.'); }
  }

  return <SiteLayout><main className="account-page page-gutter template-admin-page">
    <p className="eyebrow">ADMIN / DESIGN SYSTEM</p><h1>Product templates</h1>
    <p className="template-intro">Canvas values are coordinate units. Enter verified product specifications when available; this form does not assume physical dimensions.</p>
    <div className="template-admin-layout">
      <section className="template-list"><h2>Available templates</h2>
        {loading ? <div className="request-state" role="status">Loading templates…</div> : templates.length === 0 ? <p className="account-empty">No templates have been created.</p> : templates.map((template) => <article className="template-list-item" key={template.id}>
          <div><span className="state-kicker">{template.products?.product_divisions?.name || 'PRODUCT'} / {template.is_active ? 'ACTIVE' : 'INACTIVE'}</span><strong>{template.name}</strong><small>{template.products?.name} · {template.canvas_width} × {template.canvas_height} units</small></div>
          <div className="template-list-actions"><button className="text-link" type="button" onClick={() => edit(template)}>Edit</button><button className="text-link" type="button" onClick={() => toggleActive(template)}>{template.is_active ? 'Deactivate' : 'Activate'}</button></div>
        </article>)}
      </section>
      <form className="template-form" onSubmit={save}>
        <div className="catalogue-subheading"><h2>{editingId ? 'Edit template' : 'Create template'}</h2>{editingId && <button className="text-link" type="button" onClick={reset}>New template</button>}</div>
        <label>Product<select required value={form.product_id} onChange={(event) => setField('product_id', event.target.value)}><option value="">Select an existing product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.product_divisions?.name} · {product.name}{product.is_active ? '' : ' (inactive)'}</option>)}</select></label>
        <label>Template name<input required maxLength="120" value={form.name} onChange={(event) => setField('name', event.target.value)} /></label>
        <fieldset><legend>Canvas size · coordinate units</legend><div className="template-number-grid"><label>Width<input required type="number" min="1" step="any" value={form.canvas_width} onChange={(event) => setField('canvas_width', event.target.value)} /></label><label>Height<input required type="number" min="1" step="any" value={form.canvas_height} onChange={(event) => setField('canvas_height', event.target.value)} /></label></div></fieldset>
        <fieldset><legend>Printable boundaries · same units</legend><div className="template-number-grid"><label>X<input required type="number" min="0" step="any" value={form.printable_x} onChange={(event) => setField('printable_x', event.target.value)} /></label><label>Y<input required type="number" min="0" step="any" value={form.printable_y} onChange={(event) => setField('printable_y', event.target.value)} /></label><label>Width<input required type="number" min="1" step="any" value={form.printable_width} onChange={(event) => setField('printable_width', event.target.value)} /></label><label>Height<input required type="number" min="1" step="any" value={form.printable_height} onChange={(event) => setField('printable_height', event.target.value)} /></label></div></fieldset>
        <label>Canvas background<input className="template-color" type="color" value={form.background_color} onChange={(event) => setField('background_color', event.target.value)} /></label>
        <fieldset><legend>Allowed editing elements</legend><div className="template-checks">{['text', 'image'].map((type) => <label key={type}><input type="checkbox" checked={form.allowed_elements.includes(type)} onChange={(event) => setField('allowed_elements', event.target.checked ? [...form.allowed_elements, type] : form.allowed_elements.filter((entry) => entry !== type))} />{type === 'text' ? 'Text' : 'PNG/JPG images'}</label>)}</div></fieldset>
        <label>Future placeholder configuration · JSON<textarea rows="7" spellCheck="false" value={form.placeholder_config} onChange={(event) => setField('placeholder_config', event.target.value)} /><small>Use an object with a “placeholders” array. CSV merge currently maps tokens entered in saved design text elements.</small></label>
        <label className="template-active"><input type="checkbox" checked={form.is_active} onChange={(event) => setField('is_active', event.target.checked)} />Make this template available to customers</label>
        {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message success" role="status">{message}</p>}
        <button className="calculate-button" disabled={saving || loading}>{saving ? 'Saving…' : editingId ? 'Save template' : 'Create template'} <span>↗</span></button>
      </form>
    </div>
  </main></SiteLayout>;
}
