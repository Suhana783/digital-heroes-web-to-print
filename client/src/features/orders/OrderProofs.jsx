import { useState } from 'react';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { accountRequest } from '../../services/accountApi.js';
import { useResource } from '../../hooks/useResource.js';

export function OrderProofs({ orderId, orderItems }) {
  const resource = useResource(() => accountRequest(`/orders/${encodeURIComponent(orderId)}/proofs`), [orderId]);
  const [feedback, setFeedback] = useState({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);

  async function downloadProof(proofId) {
    setBusyId(proofId); setError('');
    try { const result = await accountRequest(`/orders/proofs/${encodeURIComponent(proofId)}/download`); setPreview({ proofId, url: result.url }); }
    catch (failure) { setError(failure.message || 'The secure proof link could not be created.'); }
    finally { setBusyId(''); }
  }

  async function respond(proofId, decision) {
    const text = feedback[proofId] || '';
    if (decision === 'changes_requested' && !text.trim()) return setError('Describe the changes you need before sending the request.');
    setBusyId(proofId); setError(''); setMessage('');
    try {
      const result = await accountRequest(`/orders/proofs/${encodeURIComponent(proofId)}/respond`, { method: 'POST', body: { decision, feedback: text } });
      setMessage(result.message); resource.retry();
    } catch (failure) { setError(failure.message || 'Your response could not be saved.'); }
    finally { setBusyId(''); }
  }

  const proofs = resource.data?.proofs || [];
  const events = resource.data?.events || [];
  return <section className="proof-customer-section" aria-labelledby="customer-proofs-heading">
    <div className="catalogue-subheading"><div><p className="eyebrow">REVIEW & APPROVAL</p><h2 id="customer-proofs-heading">Your proofs</h2></div></div>
    <RequestState loading={resource.loading} error={resource.error} onRetry={resource.retry}>
      {!proofs.length && <p className="account-empty">Proofs will appear here when our team sends them for review.</p>}
      {orderItems.map((item) => {
        const itemProofs = proofs.filter((proof) => proof.order_item_id === item.id).sort((a, b) => a.version_number - b.version_number);
        const latest = itemProofs.at(-1);
        if (!latest) return null;
        return <article className="customer-proof-item" key={item.id}>
          <h3>{item.product_name}</h3>
          {itemProofs.map((proof) => {
            const current = proof.id === latest?.id && proof.status === 'sent_to_customer';
            const proofEvents = events.filter((event) => event.proof_id === proof.id);
            return <div className="customer-proof-version" key={proof.id}>
              <div className="proof-version-heading"><strong>Version {proof.version_number}</strong><span className={`proof-status status-${proof.status}`}>{proof.status.replaceAll('_', ' ')}</span></div>
              <p className="proof-sent-date">Sent {new Date(proof.created_at).toLocaleString()}</p>
              {proof.admin_notes && <p className="proof-note"><strong>Note from our team</strong>{proof.admin_notes}</p>}
              <button className="text-link proof-download" type="button" disabled={busyId === proof.id} onClick={() => downloadProof(proof.id)}>{busyId === proof.id ? 'Preparing secure link…' : 'View proof ↗'}</button>
              {proofEvents.map((event) => <div className="proof-event" key={event.id}><span>{event.event_type.replaceAll('_', ' ')} · {new Date(event.created_at).toLocaleString()}</span>{event.message && <p>{event.message}</p>}</div>)}
              {current && <div className="proof-response">
                <button className="calculate-button" type="button" disabled={busyId === proof.id} onClick={() => respond(proof.id, 'approved')}>{busyId === proof.id ? 'Saving…' : 'Approve this proof'} <span>↗</span></button>
                <label>Request changes<textarea rows="3" maxLength="4000" value={feedback[proof.id] || ''} onChange={(event) => setFeedback((previous) => ({ ...previous, [proof.id]: event.target.value }))} placeholder="Tell us what needs changing" /></label>
                <button className="add-cart-button" type="button" disabled={busyId === proof.id} onClick={() => respond(proof.id, 'changes_requested')}>Send change request <span>↗</span></button>
              </div>}
            </div>;
          })}
          {preview?.proofId && itemProofs.some((proof) => proof.id === preview.proofId) && <div className="proof-preview"><div><strong>Proof preview</strong><button className="button-link" type="button" onClick={() => setPreview(null)}>Close</button></div><iframe title={`Proof preview for ${item.product_name}`} src={preview.url} /> <a className="text-link" href={preview.url} target="_blank" rel="noreferrer">Open PDF in a new tab ↗</a></div>}
        </article>;
      })}
    </RequestState>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {message && <p className="form-message success" role="status">{message}</p>}
  </section>;
}
