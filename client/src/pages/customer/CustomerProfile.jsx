import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { useResource } from '../../hooks/useResource.js';
import { accountRequest } from '../../services/accountApi.js';

export default function CustomerProfile() {
  const profile = useResource(() => accountRequest('/account/profile'));
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile.data) setForm({ full_name: profile.data.full_name, phone: profile.data.phone || '' });
  }, [profile.data]);

  async function submit(event) {
    event.preventDefault(); setMessage(null);
    const fullName = form.full_name.trim();
    if (!fullName || fullName.length > 120) return setMessage({ error: 'Enter a name between 1 and 120 characters.' });
    if (form.phone.trim().length > 30) return setMessage({ error: 'Phone must be 30 characters or fewer.' });
    setSaving(true);
    try {
      const data = await accountRequest('/account/profile', { method: 'PATCH', body: { full_name: fullName, phone: form.phone.trim() || null } });
      setForm({ full_name: data.full_name, phone: data.phone || '' });
      setMessage({ success: 'Profile updated successfully.' });
    } catch (error) { setMessage({ error: error.message }); }
    finally { setSaving(false); }
  }

  return <SiteLayout><main className="account-page page-gutter">
    <Link className="back-link" to="/account">← Account overview</Link><p className="eyebrow">YOUR DETAILS</p><h1>Profile</h1>
    <RequestState loading={profile.loading} error={profile.error} onRetry={profile.retry}>
      {profile.data && <form className="profile-form" onSubmit={submit}>
        <label>Full name<input value={form.full_name} maxLength="120" onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required /></label>
        <label>Email address<input value={profile.data.email} readOnly aria-describedby="email-help" /><small id="email-help">Email changes must use the Supabase Auth email confirmation process and are not available here.</small></label>
        <label>Phone number <span className="optional-label">Optional</span><input type="tel" value={form.phone} maxLength="30" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
        {message && <p className={`form-message ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.error || message.success}</p>}
        <button className="calculate-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} <span>↗</span></button>
      </form>}
    </RequestState>
  </main></SiteLayout>;
}
