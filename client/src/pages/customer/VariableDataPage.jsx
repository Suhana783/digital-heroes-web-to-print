import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';

function findPlaceholders(design) {
  const names = new Set();
  for (const element of design?.design_data?.elements || []) {
    if (element.type !== 'text') continue;
    for (const match of String(element.text || '').matchAll(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/gi)) names.add(match[1]);
  }
  return [...names];
}

function showStatus(status) {
  return status.replaceAll('_', ' ');
}

export default function VariableDataPage() {
  const csvFileRef = useRef(null);
  const [designs, setDesigns] = useState([]);
  const [batches, setBatches] = useState([]);
  const [designId, setDesignId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refreshBatches() {
    try { setBatches(await accountRequest('/variable-data/batches')); }
    catch (failure) { setError(failure.message || 'Batch history could not be refreshed.'); }
  }

  useEffect(() => {
    let active = true;
    Promise.all([accountRequest('/designer/designs'), accountRequest('/variable-data/batches')])
      .then(([designRows, batchRows]) => {
        if (!active) return;
        setDesigns(designRows); setBatches(batchRows);
        setDesignId((current) => current || designRows[0]?.id || '');
      })
      .catch((failure) => { if (active) setError(failure.message || 'CSV merge could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!generating) return undefined;
    const timer = window.setInterval(refreshBatches, 2500);
    return () => window.clearInterval(timer);
  }, [generating]);

  const selectedDesign = designs.find((design) => design.id === designId) || null;
  const placeholders = useMemo(() => findPlaceholders(selectedDesign), [selectedDesign]);
  const allMapped = placeholders.length > 0 && placeholders.every((name) => mapping[name] && preview?.headers.includes(mapping[name]));

  async function previewCsv(event) {
    event.preventDefault();
    if (!file) { setError('Choose a CSV file first.'); return; }
    setPreviewing(true); setError(''); setMessage(''); setPreview(null); setMapping({});
    try {
      const body = new FormData(); body.append('file', file);
      const result = await accountRequest('/variable-data/preview', { method: 'POST', body });
      setPreview(result);
      setMessage(`Found ${result.headers.length} columns and ${result.total_rows} data rows.`);
    } catch (failure) { setError(failure.message || 'CSV preview could not be created.'); }
    finally { setPreviewing(false); }
  }

  async function startMerge() {
    if (!file || !preview || !selectedDesign || !allMapped) return;
    setGenerating(true); setError(''); setMessage('Generating a separate PDF for each CSV row…');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('designId', selectedDesign.id);
      body.append('mapping', JSON.stringify(mapping));
      const batch = await accountRequest('/variable-data/batches', { method: 'POST', body });
      setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);
      setMessage(`Batch ${showStatus(batch.status)}: ${batch.successful_outputs} of ${batch.total_rows} PDFs generated.`);
      setPreview(null); setFile(null); setMapping({});
      if (csvFileRef.current) csvFileRef.current.value = '';
    } catch (failure) { setError(failure.message || 'Variable-data generation could not be completed.'); }
    finally { setGenerating(false); refreshBatches(); }
  }

  async function download(batchId, outputId) {
    setError('');
    try {
      const result = await accountRequest(`/variable-data/batches/${encodeURIComponent(batchId)}/outputs/${encodeURIComponent(outputId)}/download`);
      window.location.assign(result.url);
    } catch (failure) { setError(failure.message || 'The personalized PDF could not be downloaded.'); }
  }

  return <SiteLayout><main className="account-page page-gutter variable-data-page">
    <p className="eyebrow">CUSTOMER ACCOUNT / VARIABLE DATA</p><h1>CSV artwork merge</h1>
    <p className="variable-data-intro">Create a text element in a saved design using tokens such as <code>{'{{name}}'}</code> or <code>{'{{number}}'}</code>. Each CSV data row becomes its own basic PDF using the design’s saved layout.</p>
    {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message success" role="status">{message}</p>}
    {loading ? <div className="request-state" role="status">Loading saved designs and batch history…</div> : <>
      <section className="variable-data-panel">
        <div className="catalogue-subheading"><h2>Prepare a merge</h2><Link className="text-link" to="/account/designer">Create a design from a template ↗</Link></div>
        {designs.length === 0 ? <p className="account-empty">Create and save a design with text placeholders before uploading a CSV.</p> : <>
          <label className="variable-data-label">Saved design<select value={designId} onChange={(event) => { setDesignId(event.target.value); setPreview(null); setMapping({}); setMessage(''); }}>
            {designs.map((design) => <option key={design.id} value={design.id}>{design.name} · {design.product?.name || 'Product'}</option>)}
          </select></label>
          <p className="variable-data-placeholders">Detected placeholders: {placeholders.length ? placeholders.map((name) => <code key={name}>{`{{${name}}}`}</code>) : <span>None. Add tokens to a text element and save the design.</span>}</p>
          <form className="variable-data-upload" onSubmit={previewCsv}>
            <label>CSV file<input ref={csvFileRef} type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setMapping({}); setError(''); setMessage(''); }} /></label>
            <small>UTF-8 CSV with a header row; up to 1 MB, 50 columns and 100 data rows.</small>
            <button className="calculate-button" type="submit" disabled={!file || previewing || generating}>{previewing ? 'Reading CSV…' : 'Preview CSV'} <span>↗</span></button>
          </form>
        </>}
        {preview && <>
          <section className="variable-data-preview"><div className="catalogue-subheading"><h3>CSV preview</h3><span>{preview.original_filename} · {preview.total_rows} rows</span></div>
            <div className="variable-data-table-wrap"><table className="variable-data-table"><thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.preview_rows.map((row, index) => <tr key={`row-${index}`}>{preview.headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div>
          </section>
          <section className="variable-data-mapping"><h3>Map columns to design placeholders</h3>
            {placeholders.map((name) => <label key={name}><code>{`{{${name}}}`}</code><select value={mapping[name] || ''} onChange={(event) => setMapping((current) => ({ ...current, [name]: event.target.value }))}><option value="">Choose CSV column</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
            <button className="calculate-button" type="button" disabled={!allMapped || generating} onClick={startMerge}>{generating ? 'Generating PDFs…' : `Generate ${preview.total_rows} PDFs`} <span>↗</span></button>
          </section>
        </>}
      </section>
      <section className="variable-data-history"><div className="catalogue-subheading"><h2>Batch history</h2><button className="text-link" type="button" onClick={refreshBatches}>Refresh ↻</button></div>
        {!batches.length ? <p className="account-empty">Your CSV merge batches will appear here.</p> : <div className="variable-data-batches">{batches.map((batch) => <article className="variable-data-batch" key={batch.id}>
          <div className="variable-data-batch-heading"><div><span className="state-kicker">{batch.design?.name || 'Saved design'} · {batch.original_csv_filename}</span><strong>{showStatus(batch.status)}</strong><small>{new Date(batch.created_at).toLocaleString()} · {batch.successful_outputs}/{batch.total_rows} outputs</small></div></div>
          {batch.status === 'processing' && <p className="subtle-copy">Generation in progress… {batch.successful_outputs} of {batch.total_rows} complete.</p>}
          {batch.outputs?.length > 0 && <ul>{batch.outputs.map((output) => <li key={output.id}><span>CSV row {output.row_number - 1} · {output.original_filename}</span><button className="text-link" type="button" onClick={() => download(batch.id, output.id)}>Download PDF ↗</button></li>)}</ul>}
          {batch.failed_rows?.length > 0 && <details><summary>{batch.failed_rows.length} failed row{batch.failed_rows.length === 1 ? '' : 's'}</summary><ul>{batch.failed_rows.map((failed, index) => <li key={`${failed.row}-${index}`}>Row {failed.row === 0 ? 'batch setup' : failed.row - 1}: {failed.message}</li>)}</ul></details>}
        </article>)}</div>}
      </section>
    </>}
  </main></SiteLayout>;
}
