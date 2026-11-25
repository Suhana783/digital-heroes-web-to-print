import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { accountRequest } from '../../services/accountApi.js';

const STAGES = ['quote', 'order', 'artwork', 'proof', 'production', 'completed'];

function dateDaysAgo(days) {
  const date = new Date(); date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function currency(amount, code) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(Number(amount)); }
  catch { return `${code} ${amount}`; }
}

function metric(label, value, detail = '') {
  return <article className="report-metric"><span className="state-kicker">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

export default function AdminReports() {
  const [period, setPeriod] = useState('30');
  const [startDate, setStartDate] = useState(dateDaysAgo(30));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [appliedRange, setAppliedRange] = useState({ period: '30', startDate, endDate });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(selectedPeriod = period) {
    setLoading(true); setError('');
    const query = new URLSearchParams({ period: selectedPeriod });
    if (selectedPeriod === 'custom') { query.set('startDate', startDate); query.set('endDate', endDate); }
    try {
      const data = await accountRequest(`/admin/reports?${query.toString()}`);
      setReport(data); setAppliedRange({ period: selectedPeriod, startDate, endDate });
    }
    catch (failure) { setError(failure.message || 'Reports could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load('30'); }, []);

  const rangeLabel = appliedRange.period === 'all' ? 'All time' : appliedRange.period === '30' ? 'Last 30 days' : appliedRange.period === '90' ? 'Last 90 days' : `${appliedRange.startDate} to ${appliedRange.endDate}`;
  const maximumStageCount = Math.max(1, ...STAGES.map((stage) => report?.ordersByStage?.[stage] || 0));

  return <SiteLayout><main className="account-page page-gutter admin-reports-page">
    <p className="eyebrow">ADMIN / BUSINESS OVERVIEW</p><div className="admin-report-heading"><div><h1>Reports & analytics</h1><p>Order value uses stored order totals and is not collected revenue.</p></div><div className="admin-report-links"><Link className="text-link" to="/admin/products">Manage products ↗</Link><Link className="text-link" to="/admin/templates">Manage templates ↗</Link></div></div>
    <form className="report-date-filter" onSubmit={(event) => { event.preventDefault(); load(); }}>
      <label>Reporting period<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom dates</option></select></label>
      {period === 'custom' && <><label>Start date<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label>End date<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required /></label></>}
      <button className="add-cart-button" type="submit" disabled={loading}>Apply dates</button>
    </form>
    {error && <div className="request-state request-error" role="alert"><p>{error}</p><button className="button-link" type="button" onClick={() => load()}>Try again ↻</button></div>}
    {loading && <div className="request-state" role="status">Loading real order and customer records…</div>}
    {!loading && report && <>
      <p className="report-range-label">Showing order activity for {rangeLabel}.</p>
      <section className="report-metric-grid" aria-label="Summary metrics">
        {metric('Total orders · all time', report.totalOrders)}
        {metric('Orders received · selected period', report.ordersReceived)}
        {metric('Total customers', report.totalCustomers)}
        {metric('Products / divisions', `${report.totalProducts} / ${report.totalDivisions}`)}
        {metric('Completed orders', report.completedOrders)}
        {metric('Cancelled orders', report.cancelledOrders)}
      </section>
      <section className="report-value-section"><div className="catalogue-subheading"><h2>Order value · {rangeLabel}</h2><span>Cancelled orders excluded · unpaid totals remain included</span></div>
        {report.orderValueByCurrency.length ? <div className="report-value-list">{report.orderValueByCurrency.map((entry) => <article key={entry.currency}><span>{entry.currency}</span><strong>{currency(entry.amount, entry.currency)}</strong></article>)}</div> : <p className="account-empty">No non-cancelled order totals in this period.</p>}
      </section>
      <div className="report-panels">
        <section className="report-panel"><div className="catalogue-subheading"><h2>Orders by production stage</h2></div>
          <div className="report-stage-list">{STAGES.map((stage) => { const count = report.ordersByStage[stage] || 0; return <div className="report-stage" key={stage}><span>{stage}</span><div><i style={{ width: `${count / maximumStageCount * 100}%` }} /></div><strong>{count}</strong></div>; })}</div>
        </section>
        <section className="report-panel"><div className="catalogue-subheading"><h2>Orders by status</h2></div>
          {Object.keys(report.ordersByStatus).length ? <ul className="report-status-list">{Object.entries(report.ordersByStatus).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => <li key={status}><span>{status.replaceAll('_', ' ')}</span><strong>{count}</strong></li>)}</ul> : <p className="account-empty">No orders in this period.</p>}
        </section>
      </div>
      <div className="report-panels">
        <section className="report-panel"><div className="catalogue-subheading"><h2>Products with most orders</h2></div>
          {report.topProducts.length ? <ol className="report-ranking">{report.topProducts.map((product) => <li key={product.id || product.name}><span>{product.name}</span><small>{product.orders} orders · {product.units} units</small></li>)}</ol> : <p className="account-empty">No product orders in this period.</p>}
        </section>
        <section className="report-panel"><div className="catalogue-subheading"><h2>Divisions with most orders</h2></div>
          {report.topDivisions.length ? <ol className="report-ranking">{report.topDivisions.map((division) => <li key={division.slug || division.name}><span>{division.name}</span><small>{division.orders} orders · {division.units} units</small></li>)}</ol> : <p className="account-empty">No division orders in this period.</p>}
        </section>
      </div>
      <section className="report-panel report-csv-panel"><div className="catalogue-subheading"><h2>CSV variable-data batches</h2></div>
        {report.csvBatches.available ? <>
          <div className="report-csv-summary">{metric('Batches · selected period', report.csvBatches.totalBatches)}{metric('Generated output files', report.csvBatches.generatedOutputs)}</div>
          {report.csvBatches.recentBatches.length ? <div className="report-batch-list">{report.csvBatches.recentBatches.map((batch) => <article key={batch.id}><div><strong>{batch.originalCsvFilename}</strong><span>{batch.designName} · {batch.productName}</span><small>{new Date(batch.createdAt).toLocaleString()}</small></div><span>{batch.successfulOutputs}/{batch.totalRows} · {batch.status}</span></article>)}</div> : <p className="account-empty">No CSV batches in this period.</p>}
          <p className="subtle-copy">CSV batches are linked to saved designs, not order IDs, so they are shown separately from the order pipeline.</p>
        </> : <p className="account-empty">CSV batch metrics are unavailable until the Part 11 database migration is applied.</p>}
      </section>
    </>}
  </main></SiteLayout>;
}
