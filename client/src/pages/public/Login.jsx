import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthFormLayout, FormMessage } from '../../components/auth/AuthFormLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { signInCustomer } from '../../services/accountApi.js';

const showDemoAdmin = import.meta.env.VITE_SHOW_DEMO_ADMIN === 'true';
const demoAdminEmail = (import.meta.env.VITE_DEMO_ADMIN_EMAIL || '').trim();
const demoAdminPassword = import.meta.env.VITE_DEMO_ADMIN_PASSWORD || '';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { supabaseConfigured } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function fillDemoCredentials() {
    setForm({ email: demoAdminEmail, password: demoAdminPassword });
    setError('');
  }

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { error: authError } = await signInCustomer({ email: form.email.trim(), password: form.password });
      if (authError) throw authError;
      navigate(location.state?.from || '/account', { replace: true });
    } catch (authError) {
      setError(authError.message || 'Unable to sign in with those details.');
    } finally { setBusy(false); }
  }

  return <AuthFormLayout title="Welcome back" introduction="Sign in to see your account and order history.">
    {!supabaseConfigured && <FormMessage>Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env.</FormMessage>}
    {showDemoAdmin && <aside className="auth-demo-helper" aria-label="Admin demo sign-in">
      <strong>Reviewer admin demo</strong>
      <p>Use only a dedicated demo account connected to isolated sample data. These VITE_ credentials are public in the deployed frontend.</p>
      {demoAdminEmail && demoAdminPassword ? <>
        <p><span>Email</span> <code>{demoAdminEmail}</code></p>
        <p><span>Password</span> <code>{demoAdminPassword}</code></p>
        <button className="text-link" type="button" onClick={fillDemoCredentials}>Fill demo sign-in</button>
      </> : <p>Demo credentials are not configured for this deployment.</p>}
    </aside>}
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /></label>
      {error && <FormMessage>{error}</FormMessage>}
      <button className="calculate-button" disabled={busy || !supabaseConfigured}>{busy ? 'Signing in…' : 'Sign in'} <span>↗</span></button>
    </form>
    <p className="auth-switch">New to Digital Heroes? <Link to="/register">Create an account</Link></p>
  </AuthFormLayout>;
}
